import { ipcMain } from 'electron';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIChatRequest {
  streamId: string;
  provider:
    | 'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'ollama' | 'openrouter'
    | 'qwen' | 'zhipu' | 'moonshot' | 'minimax' | 'modelscope' | 'siliconflow' | 'groq' | 'custom';
  model: string;
  apiKey?: string;
  baseUrl?: string;
  headers?: Record<string, string>;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

const activeStreams = new Set<string>();

function sseDataLines(buffer: string): { events: string[]; rest: string } {
  const parts = buffer.split(/\r?\n/);
  const rest = parts.pop() ?? '';
  return { events: parts, rest };
}

async function readSSE(
  res: Response,
  onEvent: (data: string) => void,
  shouldStop?: () => boolean
): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response stream');
  const decoder = new TextDecoder();
  let buf = '';
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (shouldStop?.()) {
      reader.cancel().catch(() => undefined);
      return;
    }
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const { events, rest } = sseDataLines(buf);
    buf = rest;
    for (const line of events) {
      if (shouldStop?.()) {
        reader.cancel().catch(() => undefined);
        return;
      }
      const trimmed = line.trim();
      if (trimmed.startsWith('data:')) {
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') return;
        if (payload) onEvent(payload);
      }
    }
  }
}

async function readNDJSON(res: Response, onLine: (data: string) => void, shouldStop?: () => boolean): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response stream');
  const decoder = new TextDecoder();
  let buf = '';
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (shouldStop?.()) {
      reader.cancel().catch(() => undefined);
      return;
    }
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split(/\r?\n/);
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (shouldStop?.()) {
        reader.cancel().catch(() => undefined);
        return;
      }
      const trimmed = line.trim();
      if (trimmed) onLine(trimmed);
    }
  }
  if (buf.trim()) onLine(buf.trim());
}

async function streamOpenAICompatible(
  req: AIChatRequest,
  sender: Electron.WebContents,
  base: string,
  key: string,
  extraHeaders?: Record<string, string>
): Promise<string> {
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      ...(extraHeaders || {}),
    },
    body: JSON.stringify({
      model: req.model,
      messages: req.messages,
      temperature: req.temperature ?? 0.7,
      max_tokens: req.maxTokens ?? 4096,
      stream: true,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API error ${res.status}: ${text.slice(0, 500)}`);
  }
  let full = '';
  await readSSE(res, (data) => {
    try {
      const json = JSON.parse(data);
      const delta = json.choices?.[0]?.delta ?? {};
      // Handle both content and reasoning_content (deepseek-r1, qwen3 etc.)
      const content: string = delta.content ?? '';
      const reasoning: string = delta.reasoning_content ?? delta.reasoning ?? '';
      const chunk = content || reasoning;
      if (chunk) {
        // Only accumulate visible content into full (reasoning kept separate for keep-alive)
        if (content) full += content;
        else full += ''; // reasoning not added to final full to avoid polluting file content
        sender.send('ai:chunk', { streamId: req.streamId, chunk: chunk });
      } else {
        // Even empty delta with finish_reason or role is a keep-alive — reset client timeout
        // Send empty heartbeat to reset 90s per-chunk timeout on client
        // We do this by sending a zero-length chunk that client will ignore but still reset timeout
        // Instead, we piggyback on the fact that any data event was received — client timeout is
        // reset only on ai:chunk, so we send a heartbeat chunk of 1 space that will be trimmed?
        // Better: send a special heartbeat via ai:chunk with single zero-width?
        // For now, treat any data event (even without content) as activity via a tiny invisible chunk
        // Client will filter but timeout will reset because onAIChunk fires
        sender.send('ai:chunk', { streamId: req.streamId, chunk: '' });
      }
    } catch {
      /* ignore malformed chunk */
    }
  }, () => !activeStreams.has(req.streamId));
  return full;
}

async function streamAnthropic(
  req: AIChatRequest,
  sender: Electron.WebContents
): Promise<string> {
  const system = req.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const msgs = req.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }));
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': req.apiKey || '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: req.model,
      max_tokens: req.maxTokens ?? 4096,
      temperature: req.temperature ?? 0.7,
      system: system || undefined,
      messages: msgs,
      stream: true,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API error ${res.status}: ${text.slice(0, 500)}`);
  }
  let full = '';
  await readSSE(res, (data) => {
    try {
      const json = JSON.parse(data);
      if (json.type === 'content_block_delta' && json.delta?.text) {
        full += json.delta.text;
        sender.send('ai:chunk', { streamId: req.streamId, chunk: json.delta.text });
      }
    } catch {
      /* ignore */
    }
  }, () => !activeStreams.has(req.streamId));
  return full;
}

async function streamGemini(
  req: AIChatRequest,
  sender: Electron.WebContents
): Promise<string> {
  const system = req.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const contents = req.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
  const base = req.baseUrl?.trim() || 'https://generativelanguage.googleapis.com';
  const url = `${base}/v1beta/models/${req.model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(req.apiKey || '')}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      generationConfig: {
        temperature: req.temperature ?? 0.7,
        maxOutputTokens: req.maxTokens ?? 4096,
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API error ${res.status}: ${text.slice(0, 500)}`);
  }
  let full = '';
  await readSSE(res, (data) => {
    try {
      const json = JSON.parse(data);
      const parts = json.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if (part.text) {
          full += part.text;
          sender.send('ai:chunk', { streamId: req.streamId, chunk: part.text });
        }
      }
    } catch {
      /* ignore */
    }
  }, () => !activeStreams.has(req.streamId));
  return full;
}

async function streamOllama(
  req: AIChatRequest,
  sender: Electron.WebContents
): Promise<string> {
  const base = req.baseUrl?.trim() || 'http://localhost:11434';
  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: req.model,
      messages: req.messages,
      stream: true,
      options: { temperature: req.temperature ?? 0.7 },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Ollama error ${res.status}: ${text.slice(0, 500)}`);
  }
  let full = '';
  await readNDJSON(res, (line) => {
    try {
      const json = JSON.parse(line);
      const delta: string = json.message?.content ?? '';
      if (delta) {
        full += delta;
        sender.send('ai:chunk', { streamId: req.streamId, chunk: delta });
      }
    } catch {
      /* ignore */
    }
  }, () => !activeStreams.has(req.streamId));
  return full;
}

function nonStreamFallback(
  req: AIChatRequest,
  sender: Electron.WebContents,
  runner: (r: AIChatRequest, s: Electron.WebContents) => Promise<string>
): Promise<string> {
  return runner(req, sender);
}
void nonStreamFallback;

export function registerAIHandlers(): void {
  ipcMain.handle('ai:chat', async (e, rawReq: AIChatRequest) => {
    const req = rawReq;
    activeStreams.add(req.streamId);
    try {
      let full = '';
      switch (req.provider) {
        case 'openai':
          full = await streamOpenAICompatible(req, e.sender, req.baseUrl?.trim() || 'https://api.openai.com/v1', req.apiKey || '');
          break;
        case 'deepseek':
          full = await streamOpenAICompatible(req, e.sender, req.baseUrl?.trim() || 'https://api.deepseek.com/v1', req.apiKey || '');
          break;
        case 'qwen':
          full = await streamOpenAICompatible(req, e.sender, req.baseUrl?.trim() || 'https://dashscope.aliyuncs.com/compatible-mode/v1', req.apiKey || '');
          break;
        case 'zhipu':
          full = await streamOpenAICompatible(req, e.sender, req.baseUrl?.trim() || 'https://open.bigmodel.cn/api/paas/v4', req.apiKey || '');
          break;
        case 'moonshot':
          full = await streamOpenAICompatible(req, e.sender, req.baseUrl?.trim() || 'https://api.moonshot.cn/v1', req.apiKey || '');
          break;
        case 'minimax':
          full = await streamOpenAICompatible(req, e.sender, req.baseUrl?.trim() || 'https://api.minimax.chat/v1', req.apiKey || '');
          break;
        case 'modelscope':
          full = await streamOpenAICompatible(req, e.sender, req.baseUrl?.trim() || 'https://api-inference.modelscope.cn/v1', req.apiKey || '');
          break;
        case 'siliconflow':
          full = await streamOpenAICompatible(req, e.sender, req.baseUrl?.trim() || 'https://api.siliconflow.cn/v1', req.apiKey || '');
          break;
        case 'openrouter':
          full = await streamOpenAICompatible(
            req,
            e.sender,
            req.baseUrl?.trim() || 'https://openrouter.ai/api/v1',
            req.apiKey || '',
            { 'HTTP-Referer': 'https://velo.code-editor', 'X-Title': 'Velo Code Editor', ...(req.headers || {}) }
          );
          break;
        case 'groq':
          full = await streamOpenAICompatible(req, e.sender, req.baseUrl?.trim() || 'https://api.groq.com/openai/v1', req.apiKey || '', req.headers);
          break;
        case 'custom':
          full = await streamOpenAICompatible(req, e.sender, req.baseUrl?.trim() || 'https://api.deepseek.com/v1', req.apiKey || '', req.headers);
          break;
        case 'anthropic':
          full = await nonStreamFallback(req, e.sender, streamAnthropic);
          break;
        case 'gemini':
          full = await nonStreamFallback(req, e.sender, streamGemini);
          break;
        case 'ollama':
          full = await nonStreamFallback(req, e.sender, streamOllama);
          break;
        default:
          throw new Error(`Unknown provider: ${req.provider}`);
      }
      if (!activeStreams.has(req.streamId)) return { aborted: true };
      e.sender.send('ai:done', { streamId: req.streamId, full });
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      e.sender.send('ai:error', { streamId: req.streamId, error: message });
      return { error: message };
    } finally {
      activeStreams.delete(req.streamId);
    }
  });

  ipcMain.handle('ai:complete', async (_e, rawReq: Omit<AIChatRequest, 'streamId'>) => {
    const req: AIChatRequest = { ...rawReq, streamId: `complete-${Date.now()}` };
    try {
      let full = '';
      const collect = {
        send: (channel: string, payload: unknown) => {
          if (channel === 'ai:chunk') full += (payload as { chunk: string }).chunk;
        },
      } as unknown as Electron.WebContents;
      switch (req.provider) {
        case 'openai':
          await streamOpenAICompatible(req, collect, req.baseUrl?.trim() || 'https://api.openai.com/v1', req.apiKey || '');
          break;
        case 'deepseek':
          await streamOpenAICompatible(req, collect, req.baseUrl?.trim() || 'https://api.deepseek.com/v1', req.apiKey || '');
          break;
        case 'qwen':
          await streamOpenAICompatible(req, collect, req.baseUrl?.trim() || 'https://dashscope.aliyuncs.com/compatible-mode/v1', req.apiKey || '');
          break;
        case 'zhipu':
          await streamOpenAICompatible(req, collect, req.baseUrl?.trim() || 'https://open.bigmodel.cn/api/paas/v4', req.apiKey || '');
          break;
        case 'moonshot':
          await streamOpenAICompatible(req, collect, req.baseUrl?.trim() || 'https://api.moonshot.cn/v1', req.apiKey || '');
          break;
        case 'minimax':
          await streamOpenAICompatible(req, collect, req.baseUrl?.trim() || 'https://api.minimax.chat/v1', req.apiKey || '');
          break;
        case 'modelscope':
          await streamOpenAICompatible(req, collect, req.baseUrl?.trim() || 'https://api-inference.modelscope.cn/v1', req.apiKey || '');
          break;
        case 'siliconflow':
          await streamOpenAICompatible(req, collect, req.baseUrl?.trim() || 'https://api.siliconflow.cn/v1', req.apiKey || '');
          break;
        case 'openrouter':
          await streamOpenAICompatible(
            req,
            collect,
            req.baseUrl?.trim() || 'https://openrouter.ai/api/v1',
            req.apiKey || '',
            { 'HTTP-Referer': 'https://velo.code-editor', 'X-Title': 'Velo Code Editor', ...(req.headers || {}) }
          );
          break;
        case 'groq':
          await streamOpenAICompatible(req, collect, req.baseUrl?.trim() || 'https://api.groq.com/openai/v1', req.apiKey || '', req.headers);
          break;
        case 'custom':
          await streamOpenAICompatible(req, collect, req.baseUrl?.trim() || 'https://api.deepseek.com/v1', req.apiKey || '', req.headers);
          break;
        case 'anthropic':
          await streamAnthropic(req, collect);
          break;
        case 'gemini':
          await streamGemini(req, collect);
          break;
        case 'ollama':
          await streamOllama(req, collect);
          break;
        default:
          throw new Error(`Unknown provider: ${req.provider}`);
      }
      return { text: full.trim() };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('ai:abort', (_e, streamId: string) => {
    activeStreams.delete(streamId);
    return true;
  });

  // Generic HTTP GET for external data APIs (BigBallSports etc.)
  ipcMain.handle('net:fetch', async (_e, url: string, headers?: Record<string, string>) => {
    try {
      const res = await fetch(url, { headers: headers || undefined });
      const body = await res.text();
      if (!res.ok) return { error: `HTTP ${res.status}: ${body.slice(0, 300)}`, body };
      return { body, status: res.status };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('ai:list-models', async (_e, provider: string, apiKey?: string, baseUrl?: string) => {
    try {
      const key = apiKey || '';
      const base = baseUrl?.trim() || '';
      let models: string[] = [];
      switch (provider) {
        case 'gemini': {
          const url = `${base || 'https://generativelanguage.googleapis.com'}/v1beta/models?key=${encodeURIComponent(key)}&pageSize=200`;
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
          const json = (await res.json()) as Record<string, any>;
          models = (json.models || [])
            .filter((m: { supportedGenerationMethods?: string[] }) =>
              !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent'))
            .map((m: { name: string }) => m.name.replace(/^models\//, ''))
            .filter((n: string) => !/embedding|aqa|vision-only|image|tts|audio/i.test(n));
          break;
        }
        case 'openai': {
          const res = await fetch(`${base || 'https://api.openai.com/v1'}/models`, {
            headers: { Authorization: `Bearer ${key}` },
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
          const json = (await res.json()) as Record<string, any>;
          models = (json.data || []).map((m: { id: string }) => m.id);
          break;
        }
        case 'deepseek': {
          const res = await fetch(`${base || 'https://api.deepseek.com/v1'}/models`, {
            headers: { Authorization: `Bearer ${key}` },
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
          const json = (await res.json()) as Record<string, any>;
          models = (json.data || []).map((m: { id: string }) => m.id);
          break;
        }
        case 'openrouter': {
          const res = await fetch(`${base || 'https://openrouter.ai/api/v1'}/models`, {
            headers: key ? { Authorization: `Bearer ${key}` } : undefined,
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
          const json = (await res.json()) as Record<string, any>;
          models = (json.data || []).map((m: { id: string }) => m.id);
          break;
        }
        case 'groq':
        case 'custom': {
          const res = await fetch(`${base || (provider === 'groq' ? 'https://api.groq.com/openai/v1' : 'https://api.deepseek.com/v1')}/models`, {
            headers: { Authorization: `Bearer ${key}` },
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
          const json = (await res.json()) as Record<string, any>;
          models = (json.data || []).map((m: { id: string }) => m.id);
          break;
        }
        case 'qwen':
        case 'zhipu':
        case 'moonshot':
        case 'minimax':
        case 'modelscope':
        case 'siliconflow': {
          const bases: Record<string, string> = {
            qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
            zhipu: 'https://open.bigmodel.cn/api/paas/v4',
            moonshot: 'https://api.moonshot.cn/v1',
            minimax: 'https://api.minimax.chat/v1',
            modelscope: 'https://api-inference.modelscope.cn/v1',
            siliconflow: 'https://api.siliconflow.cn/v1',
          };
          const res = await fetch(`${base || bases[provider]}/models`, {
            headers: { Authorization: `Bearer ${key}` },
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
          const json = (await res.json()) as Record<string, any>;
          models = (json.data || []).map((m: { id: string }) => m.id);
          break;
        }
        case 'anthropic': {
          const res = await fetch(`${base || 'https://api.anthropic.com'}/v1/models?limit=100`, {
            headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
          const json = (await res.json()) as Record<string, any>;
          models = (json.data || []).map((m: { id: string }) => m.id);
          break;
        }
        case 'ollama': {
          const res = await fetch(`${base || 'http://localhost:11434'}/api/tags`);
          if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
          const json = (await res.json()) as Record<string, any>;
          models = (json.models || []).map((m: { name: string }) => m.name);
          break;
        }
        default:
          throw new Error(`Unknown provider: ${provider}`);
      }
      return { models };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });
}
