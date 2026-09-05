import { useEffect, useRef, useState } from 'react';
import { ChevronDown, RefreshCw, Check, Search, AlertTriangle, X } from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { fetchModels } from '../../services/aiService';
import type { AIProvider } from '../../types';

const FALLBACK_MODELS: Record<AIProvider, string[]> = {
  gemini: ['gemini-3.7-flash', 'gemini-3.0-pro', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash-lite', 'gemini-1.5-pro'],
  openai: ['gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'gpt-4.1', 'gpt-4o', 'gpt-4o-mini', 'o4-mini', 'o3', 'o1-preview'],
  anthropic: ['claude-4-sonnet', 'claude-4-opus', 'claude-4-haiku', 'claude-3-7-sonnet', 'claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest'],
  deepseek: ['deepseek-v3', 'deepseek-v3.2', 'deepseek-r1', 'deepseek-chat', 'deepseek-reasoner'],
  groq: ['llama-3.3-70b-versatile', 'llama-3.1-405b', 'mixtral-8x7b-32768', 'gemma2-9b-it', 'qwen3-32b'],
  openrouter: [
    'openrouter/free',
    'google/gemini-3.7-flash:free',
    'openai/gpt-5:free',
    'deepseek/deepseek-v3:free',
    'google/gemini-2.5-pro:free',
    'nvidia/nemotron-3-ultra:free',
    'z-ai/glm-5.2:free',
    'qwen/qwen3-coder-480b-a35b-instruct:free',
  ],
  ollama: ['qwen3:8b', 'qwen3:32b', 'qwen2.5-coder:32b', 'deepseek-r1:14b', 'gemma3:4b', 'llama3.3:70b', 'deepseek-coder-v2'],
  custom: ['deepseek-v3', 'deepseek-v3.2', 'deepseek-r1', 'gpt-5', 'gemini-3.7-flash', 'llama-3.3-70b-versatile'],
  qwen: ['qwen3-coder-plus', 'qwen3-235b-a22b', 'qwen3-max', 'qwen-plus', 'qwen-max', 'qwen-turbo', 'qwen2.5-coder-32b-instruct'],
  zhipu: ['glm-4.6', 'glm-5', 'glm-4.5', 'glm-4-plus', 'glm-4-flash', 'codegeex-4'],
  moonshot: ['kimi-k2.5', 'kimi-k2-preview', 'kimi-k2-turbo-preview', 'moonshot-v1-8k', 'moonshot-v1-32k'],
  minimax: ['abab6.5s-chat', 'MiniMax-M2', 'minimax-text-01'],
  modelscope: ['Qwen/Qwen3-Coder-480B-A35B-Instruct', 'Qwen/Qwen2.5-Coder-32B-Instruct', 'deepseek-ai/DeepSeek-V3.2', 'ZhipuAI/GLM-4.5'],
  siliconflow: [
    'deepseek-ai/DeepSeek-V3.2',
    'deepseek-ai/DeepSeek-V3',
    'deepseek-ai/DeepSeek-R1',
    'Qwen/Qwen3-Coder-480B-A35B-Instruct',
    'THUDM/GLM-4-9B-0414',
  ],
};

const PROVIDERS: Array<{ id: AIProvider; label: string }> = [
  { id: 'gemini', label: 'Gemini' },
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'anthropic', label: 'Claude' },
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'groq', label: 'Groq' },
  { id: 'qwen', label: 'Qwen 通义' },
  { id: 'zhipu', label: 'GLM 智谱' },
  { id: 'moonshot', label: 'Kimi' },
  { id: 'minimax', label: 'MiniMax' },
  { id: 'modelscope', label: 'ModelScope' },
  { id: 'siliconflow', label: 'SiliconFlow' },
  { id: 'ollama', label: 'Ollama' },
];

export function ModelSwitcher() {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const provider = settings.defaultProvider;
  const cfg = settings.providers[provider] || { apiKey: '', model: '', baseUrl: '' };
  const currentModel = cfg.model || 'not set';

  const [open, setOpen] = useState(false);
  const [liveModels, setLiveModels] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [custom, setCustom] = useState('');

  const loadModels = async (force = false) => {
    if (loading) return;
    if (liveModels && !force) return;
    setLoading(true);
    setError(null);
    try {
      const res = (await Promise.race([
        fetchModels(provider, cfg.apiKey || '', cfg.baseUrl || ''),
        new Promise<{ models?: string[]; error: string }>((_, rej) =>
          setTimeout(() => rej(new Error('timeout after 12s')), 12000)
        ),
      ])) as { models?: string[]; error?: string };
      if (res.models && res.models.length > 0) {
        setLiveModels(res.models);
        setError(null);
      } else {
        setLiveModels(null);
        setError(res.error || 'No models returned — showing suggestions');
      }
    } catch (e) {
      setLiveModels(null);
      setError(e instanceof Error ? e.message : 'Fetch failed — showing suggestions');
    } finally {
      setLoading(false);
    }
  };

  const openModal = () => {
    setFilter('');
    setCustom('');
    setOpen(true);
    void loadModels();
  };

  const pickProvider = async (p: AIProvider) => {
    if (p === provider) return;
    await update({ defaultProvider: p });
    setLiveModels(null);
    setError(null);
    setFilter('');
  };

  const pickModel = async (model: string) => {
    const m = model.trim();
    if (!m) return;
    await update({
      providers: { ...settings.providers, [provider]: { ...cfg, model: m } },
    });
    void import('../../store/useUIStore').then((mod) =>
      mod.useUIStore.getState().showToast(`Model set: ${m}`, 'success')
    );
    setOpen(false);
  };

  const fallback = FALLBACK_MODELS[provider] ?? [];
  const baseList = liveModels && liveModels.length > 0 ? liveModels : fallback;
  const list = baseList.filter((m) => m.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="model-switcher">
      <button className="ms-pill" onClick={openModal} title="Switch AI provider / model">
        <span className="ms-provider">{PROVIDERS.find((p) => p.id === provider)?.label || provider}</span>
        <span className="ms-model">{currentModel}</span>
        <ChevronDown size={12} />
      </button>

      {open && (
        <div className="modal-overlay" style={{ zIndex: 1200 }} onMouseDown={() => setOpen(false)}>
          <div className="modal ms-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Switch provider / model</h2>
              <button className="win-btn" onClick={() => setOpen(false)}>
                <X size={15} />
              </button>
            </div>

            <div className="ms-provider-row" style={{ padding: '0 20px 10px' }}>
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  className={`ms-provider-btn ${p.id === provider ? 'active' : ''}`}
                  onClick={() => pickProvider(p.id)}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="ms-search-row" style={{ margin: '0 20px 10px' }}>
              <Search size={13} />
              <input
                autoFocus
                placeholder="Filter models…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && list.length > 0) pickModel(list[0]);
                }}
              />
              <button
                className="ms-refresh"
                title="Refresh live model list"
                onClick={() => {
                  setLiveModels(null);
                  void loadModels(true);
                }}
              >
                <RefreshCw size={13} className={loading ? 'spin' : ''} />
              </button>
            </div>

            <div className="ms-list" style={{ padding: '0 12px 8px', maxHeight: 300 }}>
              {loading && !liveModels && <div className="ms-note ok">⟳ Loading live model list…</div>}
              {error && !loading && (
                <div className="ms-note error">
                  <AlertTriangle size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
                  {error}
                </div>
              )}
              {!loading && !error && liveModels && (
                <div className="ms-note ok">✓ {liveModels.length} models fetched live from the API</div>
              )}
              {list.map((m) => (
                <button
                  key={m}
                  className={`ms-item ${m === currentModel ? 'active' : ''}`}
                  onClick={() => pickModel(m)}
                >
                  <span className="ms-item-name">{m}</span>
                  {/(:free|openrouter\/free$)/.test(m) && <span className="ms-free">free</span>}
                  {m === currentModel && <Check size={13} />}
                </button>
              ))}
              {list.length === 0 && <div className="ms-note">No models match "{filter}"</div>}
            </div>

            <div className="ms-custom" style={{ borderTop: '1px solid var(--border)' }}>
              <input
                placeholder="Custom model id… (press Enter)"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') pickModel(custom);
                }}
              />
              <button className="btn-primary small" disabled={!custom.trim()} onClick={() => pickModel(custom)}>
                Use
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
