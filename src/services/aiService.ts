import { create } from 'zustand';
import type { AIChatRequestPayload, AIProvider } from '../types';
import { useSettingsStore } from '../store/useSettingsStore';

export interface StreamParams {
  provider: AIProvider;
  model: string;
  messages: AIChatRequestPayload['messages'];
  temperature?: number;
  maxTokens?: number;
}

export interface StreamResult {
  full: string;
  error?: string;
  aborted?: boolean;
  failovers?: string[];
}

export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function resolveAuth(provider: AIProvider): { apiKey: string; baseUrl: string; model: string } {
  const settings = useSettingsStore.getState().settings;
  const cfg = settings.providers[provider] || { apiKey: '', model: '', baseUrl: '' };
  return { apiKey: cfg.apiKey, baseUrl: cfg.baseUrl, model: cfg.model };
}

// ============================================================
// Velo Autonomous Failover Engine
// Zero-downtime switching between API keys, cloud providers
// and local models (Ollama) without interrupting the task.
// ============================================================

type FailureKind = 'rate' | 'quota' | 'server' | 'network' | 'model' | 'unknown';

interface Attempt {
  id: string;
  provider: AIProvider;
  model: string;
  apiKey: string;
  baseUrl: string;
  headers?: Record<string, string>;
  label: string;
}

interface EngineEntryState {
  cooldownUntil: number;
  exhaustedUntil: number;
  failures: number;
  requests: number;
  tokens: number;
  lastUsed: number;
}

const entryStates = new Map<string, EngineEntryState>();
let lastSuccessfulId: string | null = null;

function entryState(id: string): EngineEntryState {
  let s = entryStates.get(id);
  if (!s) {
    s = { cooldownUntil: 0, exhaustedUntil: 0, failures: 0, requests: 0, tokens: 0, lastUsed: 0 };
    entryStates.set(id, s);
  }
  return s;
}

export interface EngineStatus {
  activeLabel: string | null;
  activeProvider: AIProvider | null;
  activeModel: string | null;
  lastFailover: string | null;
  failoverCount: number;
}

export const useEngineStatus = create<EngineStatus>(() => ({
  activeLabel: null,
  activeProvider: null,
  activeModel: null,
  lastFailover: null,
  failoverCount: 0,
}));

export function getPoolUsage(): Array<{
  id: string;
  label: string;
  provider: string;
  model: string;
  requests: number;
  failures: number;
  tokens: number;
  status: 'ok' | 'cooldown' | 'exhausted';
}> {
  const settings = useSettingsStore.getState().settings;
  const now = Date.now();
  return (settings.providerPool || []).map((e) => {
    const s = entryStates.get(`pool:${e.id}`);
    return {
      id: e.id,
      label: e.label,
      provider: e.provider,
      model: e.model || settings.providers[e.provider]?.model || '',
      requests: s?.requests || 0,
      failures: s?.failures || 0,
      tokens: s?.tokens || 0,
      status:
        (s?.exhaustedUntil || 0) > now ? 'exhausted' : (s?.cooldownUntil || 0) > now ? 'cooldown' : 'ok',
    };
  });
}

function classifyError(error: string): FailureKind {
  const e = error.toLowerCase();
  if (/\b429\b|rate.?limit|too many requests/.test(e)) return 'rate';
  if (/\b402\b|insufficient|quota|billing|credit|balance|exceeded your current quota/.test(e)) return 'quota';
  if (/\b5\d\d\b|bad gateway|service unavailable|internal server error|overloaded/.test(e)) return 'server';
  if (/network|timeout|timed out|econnrefused|fetch failed|enotfound|socket/.test(e)) return 'network';
  if (/no longer available|does not exist|invalid model|decommissioned|not found/.test(e)) return 'model';
  return 'unknown';
}

function markFailure(entry: Attempt, kind: FailureKind): void {
  const s = entryState(entry.id);
  s.failures++;
  const now = Date.now();
  if (kind === 'rate') s.cooldownUntil = now + 60_000;
  else if (kind === 'quota') s.exhaustedUntil = now + 10 * 60_000;
  else if (kind === 'server' || kind === 'network') s.cooldownUntil = now + 30_000;
  else if (kind === 'model') s.exhaustedUntil = now + 60 * 60_000;
}

function markSuccess(entry: Attempt, chars: number): void {
  const s = entryState(entry.id);
  s.requests++;
  s.tokens += Math.round(chars / 4);
  s.lastUsed = Date.now();
  lastSuccessfulId = entry.id;
}

function buildAttempts(params: StreamParams): Attempt[] {
  const settings = useSettingsStore.getState().settings;
  const now = Date.now();
  const attempts: Attempt[] = [];

  // Tier-1: Native APIs — providerPool (priority sorted) + selected provider
  if (settings.failoverEnabled && (settings.providerPool || []).length > 0) {
    const pool = [...(settings.providerPool || [])]
      .filter((e) => e.enabled)
      .sort((a, b) => a.priority - b.priority);
    for (const e of pool) {
      const st = entryState(`pool:${e.id}`);
      if (st.cooldownUntil > now || st.exhaustedUntil > now) continue;
      attempts.push({
        id: `pool:${e.id}`,
        provider: e.provider,
        model: e.model || settings.providers[e.provider]?.model || '',
        apiKey: e.apiKey,
        baseUrl: e.baseUrl || settings.providers[e.provider]?.baseUrl || '',
        label: e.label,
      });
    }
    if (attempts.length === 0) {
      for (const e of pool) {
        attempts.push({
          id: `pool:${e.id}`,
          provider: e.provider,
          model: e.model || settings.providers[e.provider]?.model || '',
          apiKey: e.apiKey,
          baseUrl: e.baseUrl || settings.providers[e.provider]?.baseUrl || '',
          label: e.label,
        });
      }
    }
  }

  const { apiKey, baseUrl, model } = resolveAuth(params.provider);
  let effectiveModel = params.model || model;
  if (params.provider === 'openrouter' && !effectiveModel) {
    effectiveModel = 'openrouter/free';
  }
  const defaultAttempt: Attempt = {
    id: 'default',
    provider: params.provider,
    model: effectiveModel,
    apiKey,
    baseUrl,
    label: `${params.provider} (selected) — Tier-1`,
  };
  if (!attempts.some((a) => a.id === 'default')) attempts.push(defaultAttempt);

  if (params.provider === 'openrouter') {
    const freeModels = [
      'google/gemini-2.0-flash-exp:free',
      'meta-llama/llama-3.1-8b-instruct:free',
      'mistralai/mistral-7b-instruct:free',
      'deepseek/deepseek-r1:free',
      'qwen/qwen-2.5-7b-instruct:free',
      'google/gemma-2-9b-it:free',
      'nvidia/llama-3.1-nemotron-70b-instruct:free',
    ];
    const used = new Set(attempts.map((a) => a.model));
    for (const fm of freeModels) {
      if (used.has(fm)) continue;
      attempts.push({
        id: `openrouter:${fm}`,
        provider: 'openrouter' as AIProvider,
        model: fm,
        apiKey,
        baseUrl,
        label: `OpenRouter ${fm} — Free`,
      });
      used.add(fm);
    }
  }

  // Tier-2: Multi Custom OpenAI-Compatible Providers — each enabled provider is a Tier-2 attempt
  // Supports both legacy single customProvider and new customProviders array
  const rawSettings = settings as unknown as {
    customProvider?: { enabled: boolean; id: string; displayName: string; baseUrl: string; apiKey: string; models: string[]; headers: Record<string, string> };
    customProviders?: Array<{ enabled: boolean; id: string; displayName: string; baseUrl: string; apiKey: string; models: string[]; headers: Record<string, string> }>;
  };
  const tier2List: Array<{ enabled: boolean; id: string; displayName: string; baseUrl: string; apiKey: string; models: string[]; headers: Record<string, string> }> =
    rawSettings.customProviders && rawSettings.customProviders.length > 0
      ? rawSettings.customProviders
      : rawSettings.customProvider
        ? [rawSettings.customProvider]
        : [];
  for (const custom of tier2List) {
    if (!custom?.enabled || !custom.baseUrl) continue;
    const tier2Model = custom.models?.[0] || params.model || model;
    attempts.push({
      id: `custom:${custom.id}`,
      provider: 'custom' as AIProvider,
      model: tier2Model,
      apiKey: custom.apiKey,
      baseUrl: custom.baseUrl,
      headers: custom.headers,
      label: `${custom.displayName || custom.id} — Tier-2`,
    });
    // Also push alternative models from this custom provider as separate attempts for 300ms tiered fallback
    for (let i = 1; i < (custom.models || []).length && i < 3; i++) {
      attempts.push({
        id: `custom:${custom.id}:${i}`,
        provider: 'custom' as AIProvider,
        model: custom.models[i],
        apiKey: custom.apiKey,
        baseUrl: custom.baseUrl,
        headers: custom.headers,
        label: `${custom.displayName || custom.id} (${custom.models[i]}) — Tier-2`,
      });
    }
  }

  // Sticky: keep last successful provider first (don't switch unless it actually stops)
  if (lastSuccessfulId) {
    const idx = attempts.findIndex((a) => a.id === lastSuccessfulId);
    if (idx > 0) {
      const st = entryState(lastSuccessfulId);
      if ((st.cooldownUntil || 0) <= now && (st.exhaustedUntil || 0) <= now) {
        const [hit] = attempts.splice(idx, 1);
        attempts.unshift(hit);
      }
    }
  }

  // Tier-3: Local Offline Engine — Ollama / LM Studio (FR-2.3) — http://localhost:11434/v1
  if (settings.localFallback && params.provider !== 'ollama') {
    const ollama = settings.providers.ollama;
    if (ollama?.model) {
      attempts.push({
        id: 'local',
        provider: 'ollama',
        model: ollama.model,
        apiKey: '',
        baseUrl: ollama.baseUrl || 'http://localhost:11434',
        label: `Ollama (${ollama.model}) — Tier-3 Local`,
      });
    }
  }
  return attempts;
}

export interface StreamHandle {
  promise: Promise<StreamResult>;
  abort: () => void;
}

function extractSuggestedModel(error: string): string | null {
  const m = error.match(/use\s+(?:models\/)?([a-zA-Z0-9._\-]+)\s+for/i);
  return m ? m[1] : null;
}

function isRateLimitError(error: string): boolean {
  return /\b429\b|rate.?limit|temporarily rate-limited|too many requests/i.test(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function streamChat(
  params: StreamParams,
  onChunk: (chunk: string) => void,
  onBeforeRetry?: () => void
): StreamHandle {
  let aborted = false;
  let currentStreamId = uid();
  let abortCurrentDoRequest: (() => void) | null = null;

  const doRequest = (attempt: Attempt, modelName: string): Promise<StreamResult> => {
    currentStreamId = uid();
    const streamId = currentStreamId;
    return new Promise<StreamResult>((resolve) => {
      let full = '';
      let error: string | undefined;
      let isDone = false;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        offChunk();
        offDone();
        offError();
        abortCurrentDoRequest = null;
      };

      // Allow immediate abort to resolve this promise without waiting for timeout
      abortCurrentDoRequest = () => {
        if (!isDone) {
          isDone = true;
          cleanup();
          resolve({ full, aborted: true });
        }
      };
      if (aborted && !isDone) {
        cleanup();
        resolve({ full: '', aborted: true });
        return;
      }

      const offChunk = window.velo.onAIChunk((sid, chunk) => {
        if (sid === streamId && !aborted && !isDone) {
          if (chunk) { full += chunk; onChunk(chunk); }
          // Sticky: never clear mid-response — reset 180s per chunk, keep partial as success
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
              if (!isDone && !aborted) {
                cleanup();
                if (full.trim().length > 50) {
                  resolve({ full, error: undefined, aborted: false });
                } else {
                  resolve({ full, error: 'Stream timeout — no data for 180s', aborted: false });
                }
              }
            }, 180000);
          }
        }
      });

      const offDone = window.velo.onAIDone((sid, doneFull) => {
        if (sid === streamId && !isDone) {
          isDone = true;
          // Prefer the authoritative full from ai:done (more reliable than chunk accumulation)
          if (doneFull && doneFull.length > full.length) full = doneFull;
          cleanup();
          resolve({ full, error: undefined, aborted: aborted || false });
        }
      });

      const offError = window.velo.onAIError((sid, err) => {
        if (sid === streamId && !isDone) {
          isDone = true;
          error = err;
          cleanup();
          resolve({ full, error, aborted: false });
        }
      });

      timeoutId = setTimeout(() => {
        if (!isDone && !aborted) {
          cleanup();
          if (full.trim().length > 50) {
            resolve({ full, error: undefined, aborted: false });
          } else {
            resolve({ full, error: 'Stream timeout — no response for 300s', aborted: false });
          }
        }
      }, 300000);

      window.velo
        .aiChat({
          streamId,
          provider: attempt.provider,
          model: modelName,
          apiKey: attempt.apiKey,
          baseUrl: attempt.baseUrl,
          headers: attempt.headers,
          messages: params.messages,
          temperature: params.temperature,
          maxTokens: params.maxTokens,
        })
        .then((res) => {
          // If handler returned immediate error (e.g., 401), wait briefly for ai:error event
          if (res.error && !isDone) {
            setTimeout(() => {
              if (!isDone) {
                cleanup();
                resolve({ full, error: res.error, aborted: false });
              }
            }, 1500);
          } else if (res.error && isDone) {
            // already handled via onAIError
          }
          // Success case is handled via onAIDone — don't resolve here to avoid race
          // But if onAIDone never comes (e.g., non-streaming fallback), resolve after short delay
          if (!res.error) {
            setTimeout(() => {
              if (!isDone && !aborted) {
                // No done/error yet — maybe streaming still in progress, give it more time
                // Don't resolve yet; wait for timeout or done
              }
            }, 1000);
          }
        })
        .catch((e) => {
          if (!isDone) {
            cleanup();
            resolve({ full, error: String(e), aborted: false });
          }
        });
    });
  };

  const promise = (async (): Promise<StreamResult> => {
    const attempts = buildAttempts(params);
    const failovers: string[] = [];
    let attemptIdx = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (aborted) return { full: '', aborted: true };
      const attempt = attempts[attemptIdx];
      if (!attempt) {
        return { full: '', error: 'All providers failed — every key is exhausted or unreachable.' };
      }

      useEngineStatus.setState({
        activeLabel: attempt.label,
        activeProvider: attempt.provider,
        activeModel: attempt.model,
      });

      let modelName = attempt.model;
      let modelRetries = 0;
      let rateRetries = 0;

      // Inner loop: model self-heal + same-key rate retry
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (aborted) return { full: '', aborted: true };
        const res = await doRequest(attempt, modelName);
        if (aborted) return { full: '', aborted: true };

        if (!res.error) {
          markSuccess(attempt, res.full.length);
          return { ...res, failovers: failovers.length ? failovers : undefined };
        }

        // 1) Retired model self-heal
        const suggested = extractSuggestedModel(res.error);
        if (suggested && suggested !== modelName) {
          try {
            const s = useSettingsStore.getState();
            const cfg = s.settings.providers[attempt.provider];
            if (cfg) {
              await s.update({
                providers: { ...s.settings.providers, [attempt.provider]: { ...cfg, model: suggested } },
              });
            }
          } catch {
            /* settings update failed — still retry below */
          }
          const { useUIStore } = await import('../store/useUIStore');
          useUIStore
            .getState()
            .showToast(`Model "${modelName}" is retired — switched to "${suggested}", retrying…`, 'info');
          modelName = suggested;
          continue;
        }

        // 2) Same-key rate-limit retry with backoff (before failing over)
        if (isRateLimitError(res.error) && rateRetries < 2) {
          rateRetries++;
          const delayMs = rateRetries * 4000;
          const { useUIStore } = await import('../store/useUIStore');
          useUIStore
            .getState()
            .showToast(`Rate limited — retrying in ${delayMs / 1000}s (attempt ${rateRetries}/2)…`, 'info');
          await sleep(delayMs);
          if (aborted) return { full: '', aborted: true };
          continue;
        }

        // 3) Fail over to the next key / provider / local model
        const kind = classifyError(res.error);
        markFailure(attempt, kind);
        attemptIdx++;
        const next = attempts[attemptIdx];
        if (next) {
          failovers.push(`${attempt.label} → ${next.label} (${kind})`);
          useEngineStatus.setState({
            lastFailover: `${attempt.label} → ${next.label} (${kind})`,
            failoverCount: useEngineStatus.getState().failoverCount + 1,
          });
          const { useUIStore } = await import('../store/useUIStore');
          useUIStore
            .getState()
            .showToast(`⚡ ${attempt.label} failed (${kind}) — switched to ${next.label}`, 'info');
          onBeforeRetry?.();
          break; // move to next attempt
        }
        return { full: res.full, error: res.error, failovers: failovers.length ? failovers : undefined };
      }
    }
  })();

  return {
    promise,
    abort: () => {
      aborted = true;
      window.velo.aiAbort(currentStreamId);
      if (abortCurrentDoRequest) abortCurrentDoRequest();
    },
  };
}

export async function fetchModels(
  provider: AIProvider,
  apiKey: string,
  baseUrl: string
): Promise<{ models?: string[]; error?: string }> {
  try {
    return await window.velo.aiListModels(provider, apiKey, baseUrl);
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function aiComplete(prompt: {
  prefix: string;
  suffix: string;
}): Promise<string> {
  const settings = useSettingsStore.getState().settings;
  const provider = settings.defaultProvider;
  const { apiKey, baseUrl, model } = resolveAuth(provider);
  const system =
    'You are a code autocomplete engine. Continue the code at <CURSOR>. Reply ONLY with the raw code to insert at the cursor — no explanations, no markdown fences. Keep it short (1-3 lines) unless obvious continuation requires more.';
  const user = `File context (code before cursor):\n${prompt.prefix}\n<CURSOR>\nCode after cursor:\n${prompt.suffix}\n\nWrite ONLY the text to insert at <CURSOR>.`;
  const messages = [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: user },
  ];
  // Failover-aware: try the pool, then the default, then local
  const attempts = buildAttempts({ provider, model, messages, temperature: 0.2, maxTokens: 160 });
  for (const attempt of attempts) {
    try {
      const res = await window.velo.aiComplete({
        provider: attempt.provider,
        model: attempt.model,
        apiKey: attempt.apiKey,
        baseUrl: attempt.baseUrl,
        messages,
        temperature: 0.2,
        maxTokens: 160,
      });
      if (res.text) {
        markSuccess(attempt, res.text.length);
        return res.text;
      }
      markFailure(attempt, classifyError(res.error || 'unknown'));
    } catch {
      markFailure(attempt, 'network');
    }
  }
  return '';
}

export async function isAIReady(): Promise<boolean> {
  const settings = useSettingsStore.getState().settings;
  const provider = settings.defaultProvider;
  const { apiKey } = resolveAuth(provider);
  if (provider === 'ollama') return true;
  return Boolean(apiKey);
}
