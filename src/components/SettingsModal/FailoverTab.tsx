import { useEffect, useState } from 'react';
import { Zap, Plus, Trash2, Activity } from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useUIStore } from '../../store/useUIStore';
import { getPoolUsage, useEngineStatus, streamChat } from '../../services/aiService';
import type { AIProvider, Settings } from '../../types';

const POOL_PROVIDERS: Array<{ id: AIProvider; label: string }> = [
  { id: 'gemini', label: 'Google Gemini' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'anthropic', label: 'Anthropic Claude' },
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'qwen', label: 'Qwen 通义' },
  { id: 'zhipu', label: 'GLM 智谱' },
  { id: 'moonshot', label: 'Kimi' },
  { id: 'minimax', label: 'MiniMax' },
  { id: 'modelscope', label: 'ModelScope' },
  { id: 'siliconflow', label: 'SiliconFlow' },
  { id: 'ollama', label: 'Ollama (local)' },
];

export function FailoverTab() {
  const { settings, update } = useSettingsStore();
  const showToast = useUIStore((s) => s.showToast);
  const engine = useEngineStatus();
  const [usage, setUsage] = useState(getPoolUsage());
  const [testing, setTesting] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setUsage(getPoolUsage()), 2000);
    return () => clearInterval(t);
  }, []);

  const setLocal = (fn: (s: Settings) => Settings) => {
    void update(fn(useSettingsStore.getState().settings));
  };

  const addEntry = async (provider: AIProvider, label: string, apiKey: string, model: string, baseUrl: string) => {
    const pool = settings.providerPool || [];
    await update({
      providerPool: [
        ...pool,
        {
          id: `pool-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          provider,
          label: label || `${provider} key ${pool.length + 1}`,
          apiKey,
          model: model || undefined,
          baseUrl: baseUrl || undefined,
          priority: pool.length,
          enabled: true,
        },
      ],
    });
    showToast('Added to the failover pool', 'success');
  };

  const testEntry = async (entryId: string) => {
    setTesting(entryId);
    const entry = (settings.providerPool || []).find((e) => e.id === entryId);
    if (!entry) return;
    const model = entry.model || settings.providers[entry.provider]?.model || '';
    const res = await streamChat(
      {
        provider: entry.provider,
        model,
        messages: [{ role: 'user', content: 'Reply with the single word: pong' }],
        maxTokens: 10,
        temperature: 0,
      },
      () => undefined
    ).promise;
    setTesting(null);
    if (res.error) showToast(`✗ ${entry.label}: ${res.error.slice(0, 120)}`, 'error');
    else showToast(`✓ ${entry.label} works`, 'success');
  };

  return (
    <>
      <p className="settings-hint">
        <strong>Velo Autonomous Failover Engine</strong> — add multiple API keys and providers. When one fails
        (429 rate limit, out of credits, server error, network down), Velo switches to the next one
        automatically in under a second, and falls back to your local Ollama models as the last line of
        defense. Your keys stay encrypted on this machine.
      </p>

      <div className="settings-section row">
        <label>Enable Auto-Failover Engine</label>
        <input
          type="checkbox"
          checked={settings.failoverEnabled}
          onChange={(e) => setLocal((s) => ({ ...s, failoverEnabled: e.target.checked }))}
        />
      </div>
      <div className="settings-section row">
        <label>Local Fallback (Ollama as last resort)</label>
        <input
          type="checkbox"
          checked={settings.localFallback}
          onChange={(e) => setLocal((s) => ({ ...s, localFallback: e.target.checked }))}
        />
      </div>

      <div className="settings-section provider-card">
        <div className="provider-title">
          <strong>
            <Activity size={13} style={{ verticalAlign: -2 }} /> Live status
          </strong>
        </div>
        <p className="settings-hint">
          Active: {engine.activeLabel || settings.defaultProvider} · Failovers this session:{' '}
          {engine.failoverCount}
          {engine.lastFailover ? ` · Last: ${engine.lastFailover}` : ''}
        </p>
      </div>

      {(settings.providerPool || []).map((entry, i) => {
        const u = usage.find((x) => x.id === entry.id);
        return (
          <div className="settings-section provider-card" key={entry.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <strong style={{ flex: 1 }}>
                #{i + 1} {entry.label}
              </strong>
              <span
                className={`mp-badge ${u?.status === 'ok' ? 'native' : u?.status === 'cooldown' ? 'install' : 'external'}`}
              >
                {u?.status || 'ok'}
              </span>
            </div>
            <p className="settings-hint">
              {entry.provider} · {entry.model || 'default model'} · key: {entry.apiKey ? '••••' + entry.apiKey.slice(-4) : '—'}
            </p>
            <p className="settings-hint">
              Requests: {u?.requests || 0} · Failures: {u?.failures || 0} · ~{u?.tokens || 0} tokens
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-ghost small" onClick={() => testEntry(entry.id)} disabled={testing === entry.id}>
                <Zap size={12} /> {testing === entry.id ? 'Testing…' : 'Test'}
              </button>
              <button
                className="btn-ghost small"
                onClick={() =>
                  setLocal((s) => ({
                    ...s,
                    providerPool: (s.providerPool || []).map((x) => (x.id === entry.id ? { ...x, enabled: !x.enabled } : x)),
                  }))
                }
              >
                {entry.enabled ? 'Disable' : 'Enable'}
              </button>
              <button
                className="btn-ghost small"
                onClick={() =>
                  setLocal((s) => ({ ...s, providerPool: (s.providerPool || []).filter((x) => x.id !== entry.id) }))
                }
              >
                <Trash2 size={12} /> Remove
              </button>
            </div>
          </div>
        );
      })}

      <AddPoolForm onAdd={addEntry} />
    </>
  );
}

function AddPoolForm({
  onAdd,
}: {
  onAdd: (provider: AIProvider, label: string, apiKey: string, model: string, baseUrl: string) => void;
}) {
  const [provider, setProvider] = useState<AIProvider>('openrouter');
  const [label, setLabel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');

  return (
    <div className="settings-section provider-card">
      <label>
        <Plus size={13} style={{ verticalAlign: -2 }} /> Add key to the pool
      </label>
      <select value={provider} onChange={(e) => setProvider(e.target.value as AIProvider)}>
        {POOL_PROVIDERS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <input placeholder="Label (e.g. OpenRouter free key)" value={label} onChange={(e) => setLabel(e.target.value)} />
      <input type="password" placeholder="API key (sk-…)" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
      <input placeholder="Model override (optional)" value={model} onChange={(e) => setModel(e.target.value)} />
      <input placeholder="Base URL override (optional)" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
      <button
        className="btn-primary small"
        disabled={!apiKey.trim()}
        onClick={() => {
          onAdd(provider, label, apiKey.trim(), model.trim(), baseUrl.trim());
          setLabel('');
          setApiKey('');
          setModel('');
          setBaseUrl('');
        }}
      >
        Add to Pool
      </button>
    </div>
  );
}
