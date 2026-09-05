import { useEffect, useState } from 'react';
import { X, Sparkles, Type, TerminalSquare, Info, Store, Zap } from 'lucide-react';
import { useUIStore } from '../../store/useUIStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useAppInfo } from '../../hooks/useAppInfo';
import { MarketplaceTab } from './MarketplaceTab';
import { FailoverTab } from './FailoverTab';
import { useT } from '../../services/i18n';
import type { AIProvider, Settings } from '../../types';

function TerminalSettings({
  local,
  setLocal,
}: {
  local: Settings;
  setLocal: (fn: (s: Settings) => Settings) => void;
}) {
  const [shells, setShells] = useState<Array<{ name: string; path: string }>>([]);
  const info = useAppInfo();

  useEffect(() => {
    window.velo
      .detectShells()
      .then(setShells)
      .catch(() => undefined);
  }, []);

  const known = shells.some((s) => s.path === local.terminalShell);
  return (
    <>
      <div className="settings-section">
        <label>Shell (auto-detected)</label>
        <select
          value={known ? local.terminalShell : ''}
          onChange={(e) => setLocal((s) => ({ ...s, terminalShell: e.target.value }))}
        >
          <option value="">Auto — best shell on this PC (recommended)</option>
          {shells.map((s) => (
            <option key={s.path} value={s.path}>
              {s.name}
            </option>
          ))}
          {local.terminalShell && !known && (
            <option value={local.terminalShell}>{local.terminalShell} (custom)</option>
          )}
        </select>
        <p className="settings-hint">
          Velo picks the best available shell automatically (PowerShell 7 → Windows PowerShell → CMD → Git
          Bash).
        </p>
      </div>
      <div className="settings-section">
        <p className="settings-hint">
          PTY status: {info?.ptyAvailable ? 'native (full interactive terminal)' : 'basic mode (piped)'}
        </p>
      </div>
    </>
  );
}

const PROVIDERS: Array<{ id: AIProvider; label: string; hint: string; models: string[] }> = [
  {
    id: 'gemini',
    label: 'Google Gemini ⭐ 3.7',
    hint: 'Get a free key at aistudio.google.com — Gemini 3.7 Flash is latest',
    models: [
      'gemini-3.7-flash',
      'gemini-3.0-pro',
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-2.5-flash-lite',
      'gemini-1.5-pro',
    ],
  },
  {
    id: 'openai',
    label: 'OpenAI GPT-5',
    hint: 'platform.openai.com/api-keys — GPT-5 is latest (2026)',
    models: ['gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'gpt-4.1', 'gpt-4o', 'gpt-4o-mini', 'o4-mini', 'o3', 'o1-preview'],
  },
  {
    id: 'anthropic',
    label: 'Anthropic Claude 4',
    hint: 'console.anthropic.com — Claude 4 Sonnet/Opus latest',
    models: ['claude-4-sonnet', 'claude-4-opus', 'claude-4-haiku', 'claude-3-7-sonnet', 'claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest'],
  },
  {
    id: 'deepseek',
    label: 'DeepSeek V3.2',
    hint: 'platform.deepseek.com — DeepSeek V3 / R1 reasoning',
    models: ['deepseek-v3', 'deepseek-v3.2', 'deepseek-r1', 'deepseek-chat', 'deepseek-reasoner'],
  },
  {
    id: 'groq',
    label: 'Groq (Llama 3.3)',
    hint: 'console.groq.com — ultra-fast <200ms',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-405b', 'mixtral-8x7b-32768', 'gemma2-9b-it', 'qwen3-32b'],
  },
  {
    id: 'openrouter',
    label: 'OpenRouter (300+ models)',
    hint: 'One key for everything — openrouter.ai/keys (has free models including Gemini 3.7 & GPT-5)',
    models: [
      'openrouter/free',
      'google/gemini-3.7-flash:free',
      'openai/gpt-5:free',
      'deepseek/deepseek-v3:free',
      'google/gemini-2.5-pro:free',
      'nvidia/nemotron-3-ultra:free',
      'z-ai/glm-5.2:free',
      'qwen/qwen3-coder-480b-a35b-instruct:free',
    ],
  },
  {
    id: 'ollama',
    label: 'Ollama (Local) — Tier-3 Offline',
    hint: 'Run models locally — no internet needed — http://localhost:11434',
    models: ['qwen3:8b', 'qwen3:32b', 'qwen2.5-coder:32b', 'deepseek-r1:14b', 'gemma3:4b', 'llama3.3:70b', 'deepseek-coder-v2'],
  },
  {
    id: 'qwen',
    label: 'Qwen 3 通义千问 (Alibaba)',
    hint: 'Chinese — bailian.console.aliyun.com — Qwen3 Coder Plus latest',
    models: ['qwen3-coder-plus', 'qwen3-235b-a22b', 'qwen3-max', 'qwen-plus', 'qwen-turbo', 'qwen2.5-coder-32b-instruct'],
  },
  {
    id: 'zhipu',
    label: 'GLM 智谱 (Zhipu)',
    hint: 'Chinese — open.bigmodel.cn — GLM-4.6 & GLM-5 latest',
    models: ['glm-4.6', 'glm-5', 'glm-4.5', 'glm-4-plus', 'glm-4-flash', 'codegeex-4'],
  },
  {
    id: 'moonshot',
    label: 'Kimi 月之暗面 (Moonshot)',
    hint: 'Chinese — platform.moonshot.cn — Kimi K2.5 latest',
    models: ['kimi-k2.5', 'kimi-k2-preview', 'kimi-k2-turbo-preview', 'moonshot-v1-8k', 'moonshot-v1-32k'],
  },
  {
    id: 'minimax',
    label: 'MiniMax M2',
    hint: 'Chinese — platform.minimaxi.com — MiniMax-M2 latest',
    models: ['abab6.5s-chat', 'MiniMax-M2', 'minimax-text-01'],
  },
  {
    id: 'modelscope',
    label: 'ModelScope 魔搭 (FREE)',
    hint: 'Chinese — FREE models — modelscope.cn — Alibaba Qwen3 480B',
    models: ['Qwen/Qwen3-Coder-480B-A35B-Instruct', 'Qwen/Qwen2.5-Coder-32B-Instruct', 'deepseek-ai/DeepSeek-V3.2', 'ZhipuAI/GLM-4.5'],
  },
  {
    id: 'siliconflow',
    label: 'SiliconFlow 硅基流动',
    hint: 'Chinese — siliconflow.cn — many free Chinese models — DeepSeek V3.2',
    models: [
      'deepseek-ai/DeepSeek-V3.2',
      'deepseek-ai/DeepSeek-V3',
      'deepseek-ai/DeepSeek-R1',
      'Qwen/Qwen3-Coder-480B-A35B-Instruct',
      'THUDM/GLM-4-9B-0414',
    ],
  },
];

type Tab = 'providers' | 'failover' | 'marketplace' | 'appearance' | 'keybindings' | 'mcp' | 'plugins' | 'snippets' | 'terminal' | 'about';

const DEFAULT_KEYBINDINGS: Record<string, string> = {
  commandPalette: 'Ctrl+Shift+P',
  quickOpen: 'Ctrl+P',
  save: 'Ctrl+S',
  saveAll: 'Ctrl+Shift+S',
  toggleTerminal: 'Ctrl+`',
  toggleAI: 'Ctrl+I',
  toggleSidebar: 'Ctrl+B',
  globalSearch: 'Ctrl+Shift+F',
  run: 'F5',
  settings: 'Ctrl+,',
  zen: 'Ctrl+K Z',
  splitEditor: 'Ctrl+\\',
};

function KeybindingRow({ title, value, onChange }: { title: string; value: string; onChange: (v: string) => void }) {
  const [capturing, setCapturing] = useState(false);
  return (
    <div className="kb-row">
      <span>{title}</span>
      <input
        className="kb-input"
        readOnly
        value={capturing ? 'Press keys…' : value || '—'}
        onClick={() => setCapturing(true)}
        onBlur={() => setCapturing(false)}
        onKeyDown={(e) => {
          if (!capturing) return;
          e.preventDefault();
          if (e.key === 'Escape') {
            setCapturing(false);
            return;
          }
          const parts: string[] = [];
          if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
          if (e.shiftKey) parts.push('Shift');
          if (e.altKey) parts.push('Alt');
          const key = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key;
          if (!['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
            onChange([...parts, key].join('+'));
            setCapturing(false);
          }
        }}
      />
    </div>
  );
}

function McpSettings() {
  const { settings, update } = useSettingsStore();
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [tools, setTools] = useState<Record<string, string[]>>({});
  const [status, setStatus] = useState('');

  const add = async () => {
    if (!name.trim() || !command.trim()) return;
    const parsedArgs = args.trim() ? args.trim().split(/\s+/) : [];
    await update({
      mcpServers: [...(settings.mcpServers || []), { name: name.trim(), command: command.trim(), args: parsedArgs, enabled: true }],
    });
    setName('');
    setCommand('');
    setArgs('');
  };

  const testConnect = async (serverName: string) => {
    setStatus(`Connecting to ${serverName}…`);
    const res = await window.velo.mcpConnect(serverName);
    if (res.error) setStatus(`✗ ${res.error}`);
    else {
      setTools((t) => ({ ...t, [serverName]: (res.tools || []).map((x) => x.name) }));
      setStatus(`✓ Connected — ${(res.tools || []).length} tools available`);
    }
  };

  return (
    <>
      <p className="settings-hint">
        Add MCP (Model Context Protocol) servers — their tools become available to the Agent. Example command:{' '}
        <code className="inline-code">npx -y @modelcontextprotocol/server-filesystem C:\projects</code>
      </p>
      {(settings.mcpServers || []).map((s) => (
        <div className="settings-section provider-card" key={s.name}>
          <div className="provider-title">
            <strong>{s.name}</strong>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <input
                type="checkbox"
                checked={s.enabled}
                onChange={(e) =>
                  update({
                    mcpServers: (settings.mcpServers || []).map((x) =>
                      x.name === s.name ? { ...x, enabled: e.target.checked } : x
                    ),
                  })
                }
              />
              Enabled
            </label>
          </div>
          <p className="settings-hint">
            {s.command} {s.args.join(' ')}
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-ghost small" onClick={() => testConnect(s.name)}>
              Connect & List Tools
            </button>
            <button
              className="btn-ghost small"
              onClick={() => update({ mcpServers: (settings.mcpServers || []).filter((x) => x.name !== s.name) })}
            >
              Remove
            </button>
          </div>
          {tools[s.name] && <p className="settings-hint">Tools: {tools[s.name].join(', ')}</p>}
        </div>
      ))}
      <div className="settings-section provider-card">
        <label>Add MCP server</label>
        <input placeholder="Name (e.g. filesystem)" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="Command (e.g. npx)" value={command} onChange={(e) => setCommand(e.target.value)} />
        <input placeholder="Arguments (space separated)" value={args} onChange={(e) => setArgs(e.target.value)} />
        <button className="btn-primary small" onClick={add} disabled={!name.trim() || !command.trim()}>
          Add Server
        </button>
        {status && <p className="settings-hint">{status}</p>}
      </div>
    </>
  );
}

function PluginsSettings() {
  const [plugins, setPlugins] = useState<Array<{ name: string; path: string }>>([]);
  const load = () => {
    window.velo
      .pluginsList()
      .then((list) => setPlugins(list.map((p) => ({ name: p.name, path: p.path }))))
      .catch(() => undefined);
  };
  useEffect(load, []);
  return (
    <>
      <p className="settings-hint">
        Drop <code className="inline-code">.js</code> files in the plugins folder. Each plugin has a global{' '}
        <code className="inline-code">velo</code> API:{' '}
        <code className="inline-code">velo.registerCommand('id', 'Title', fn)</code>,{' '}
        <code className="inline-code">velo.ui.showToast(msg)</code>,{' '}
        <code className="inline-code">velo.editor.getActiveContent()</code>,{' '}
        <code className="inline-code">velo.ai.ask(prompt)</code>. Commands appear in the Command Palette.
      </p>
      {plugins.length === 0 && <div className="git-empty">No plugins installed</div>}
      {plugins.map((p) => (
        <div className="settings-section provider-card" key={p.path}>
          <strong>{p.name}</strong>
          <p className="settings-hint">{p.path}</p>
        </div>
      ))}
      <button className="btn-ghost small" onClick={() => window.velo.pluginsOpenFolder()}>
        Open Plugins Folder
      </button>
      <button className="btn-ghost small" onClick={load}>
        Refresh List
      </button>
    </>
  );
}

function SnippetsSettings() {
  const { settings, update } = useSettingsStore();
  const [text, setText] = useState(JSON.stringify(settings.snippets || {}, null, 2));
  const [err, setErr] = useState('');
  return (
    <div className="settings-section">
      <label>User snippets (JSON — keyed by language)</label>
      <textarea
        className="snippets-editor"
        rows={16}
        spellCheck={false}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {err && <p className="settings-hint" style={{ color: 'var(--red)' }}>{err}</p>}
      <button
        className="btn-primary small"
        onClick={async () => {
          try {
            const parsed = JSON.parse(text);
            await update({ snippets: parsed });
            setErr('');
          } catch (e) {
            setErr(`Invalid JSON: ${e instanceof Error ? e.message : e}`);
          }
        }}
      >
        Save Snippets
      </button>
      <p className="settings-hint">
        Use <code className="inline-code">$1</code>, <code className="inline-code">$0</code> for tab stops and{' '}
        <code className="inline-code">{'${1:default}'}</code> for placeholders.
      </p>
    </div>
  );
}

export function SettingsModal() {
  const { settingsOpen, setSettingsOpen } = useUIStore();
  const { settings, update } = useSettingsStore();
  const [tab, setTab] = useState<Tab>('providers');
  const [local, setLocal] = useState<Settings>(settings);
  const info = useAppInfo();
  const [extThemes, setExtThemes] = useState<Array<{ value: string; label: string }>>([]);
  const tr = useT();

  useEffect(() => {
    if (settingsOpen) {
      // Migrate legacy single customProvider → array for UI
      const migrated: Settings = {
        ...settings,
        customProviders:
          (settings as unknown as { customProviders?: Settings['customProviders'] }).customProviders?.length
            ? (settings as unknown as { customProviders: Settings['customProviders'] }).customProviders
            : settings.customProvider
              ? [settings.customProvider]
              : [],
      } as Settings;
      setLocal(migrated);
      void import('../../services/themeConverterService').then((m) => m.listInstalledThemes().then(setExtThemes));
    }
  }, [settingsOpen, settings]);

  useEffect(() => {
    const handler = () => setTab('marketplace');
    window.addEventListener('velo-open-marketplace', handler);
    return () => window.removeEventListener('velo-open-marketplace', handler);
  }, []);

  if (!settingsOpen) return null;

  const save = async () => {
    await update(local);
    setSettingsOpen(false);
    useUIStore.getState().showToast('Settings saved', 'success');
  };

  const setProvider = (id: string, patch: Partial<Settings['providers'][string]>) => {
    setLocal((s) => ({
      ...s,
      providers: { ...s.providers, [id]: { ...s.providers[id], ...patch } },
    }));
  };

  return (
    <div className="modal-overlay" onMouseDown={() => setSettingsOpen(false)}>
      <div className="modal settings-modal settings-modal-modern" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Sparkles size={16} color="#fff" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 16 }}>{tr('settings')}</h2>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--text-3)' }}>{tr('settingsCustomize')}</p>
            </div>
          </div>
          <button className="win-btn" onClick={() => setSettingsOpen(false)}>
            <X size={15} />
          </button>
        </div>
        <div className="settings-content-wrapper" style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          <div className="settings-sidebar">
            {(
              [
                ['providers', 'AI Providers', <Sparkles size={14} key="a" />, 'Models & API keys'],
                ['failover', 'Failover', <Zap size={14} key="z" />, 'Auto-switch & pool'],
                ['appearance', 'Appearance', <Type size={14} key="b" />, 'Theme & editor'],
                ['keybindings', 'Shortcuts', <Type size={14} key="c" />, 'Keyboard'],
                ['terminal', 'Terminal', <TerminalSquare size={14} key="g" />, 'Shell & PTY'],
                ['mcp', 'MCP Tools', <Sparkles size={14} key="d" />, 'External tools'],
                ['marketplace', 'Extensions', <Store size={14} key="m" />, 'Themes & more'],
                ['snippets', 'Snippets', <Type size={14} key="f" />, 'Code templates'],
                ['plugins', 'Plugins', <Sparkles size={14} key="e" />, 'JS plugins'],
                ['about', 'About', <Info size={14} key="h" />, 'Version & info'],
              ] as Array<[Tab, string, JSX.Element, string]>
            ).map(([id, label, icon, desc]) => (
              <button key={id} className={`settings-nav-item ${tab === id ? 'active' : ''}`} onClick={() => setTab(id as Tab)}>
                <span className="settings-nav-icon">{icon}</span>
                <span className="settings-nav-text">
                  <span className="settings-nav-label">{label}</span>
                  <span className="settings-nav-desc">{desc}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="settings-body settings-body-modern">
          {tab === 'providers' && (
            <>
              <div className="settings-section">
                <label>Default provider</label>
                <select
                  value={local.defaultProvider}
                  onChange={(e) => setLocal((s) => ({ ...s, defaultProvider: e.target.value as AIProvider }))}
                >
                  {PROVIDERS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <p className="settings-hint">Used for chat, agent, inline edit (Ctrl+K) and ghost text.</p>
              </div>

              {/* Tier-2 Multi Custom Providers — جديد: يدعم عدة موفرات مع failover تلقائي */}
              <div className="settings-section provider-card" style={{ border: '1px dashed var(--border)', background: 'var(--bg-1)', padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <strong>🔀 المستوى 2: الموفرات المخصصة (Multi Tier-2) — {(local.customProviders || []).filter((c) => c.enabled).length} مفعّل / {(local.customProviders || []).length} إجمالي</strong>
                  <button
                    className="btn-primary small"
                    onClick={() => {
                      const nid = `custom_${Date.now().toString(36)}`;
                      const n = { enabled: true, id: nid, displayName: `Custom ${((local.customProviders || []).length + 1)}`, baseUrl: 'https://api.openai.com/v1', apiKey: '', models: ['gpt-4o-mini'], headers: {} as Record<string, string> };
                      setLocal((s) => {
                        const arr = [...(s.customProviders || []), n];
                        return { ...s, customProviders: arr, customProvider: arr[0] };
                      });
                    }}
                  >
                    ＋ إضافة موفر
                  </button>
                </div>
                <p className="settings-hint">
                  كل موفر يُجرَّب بالترتيب — إذا فشل الأول (rate-limit/quota/network) ينتقل تلقائياً للثاني في &lt;300ms، ثم الثالث، وهكذا. مفيد لـ DeepSeek/Groq/OpenRouter/خوادم شركات. اسحب لتغيير الترتيب.
                </p>
                {(local.customProviders || []).length === 0 && (
                  <p className="settings-hint" style={{ textAlign: 'center', padding: 12, border: '1px dashed var(--border-light)', borderRadius: 8 }}>لا يوجد موفر مخصص — اضغط “إضافة موفر” لإنشاء واحد. سيتم الترحيل تلقائياً من الموفر القديم إن وجد.</p>
                )}
                {(local.customProviders || []).map((cp, idx) => (
                  <div key={cp.id + idx} className="settings-section provider-card" style={{ borderColor: cp.enabled ? '#67e8a5' : undefined, marginTop: 12, position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700 }}>#{idx + 1}</span>
                        <strong style={{ fontSize: 13 }}>{cp.displayName || cp.id}</strong>
                        <span style={{ fontSize: 10, color: cp.enabled ? 'var(--green)' : 'var(--text-3)', border: `1px solid ${cp.enabled ? 'var(--green)' : 'var(--border)'}`, borderRadius: 4, padding: '1px 6px' }}>{cp.enabled ? 'مفعّل' : 'معطّل'}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                          <input
                            type="checkbox"
                            checked={!!cp.enabled}
                            onChange={(e) => {
                              const v = e.target.checked;
                              setLocal((s) => {
                                const arr = [...(s.customProviders || [])];
                                arr[idx] = { ...arr[idx], enabled: v };
                                return { ...s, customProviders: arr, customProvider: arr[0] || s.customProvider };
                              });
                            }}
                          />
                          تفعيل
                        </label>
                        <button
                          className="btn-ghost small"
                          title="حذف هذا الموفر"
                          onClick={() => {
                            setLocal((s) => {
                              const arr = (s.customProviders || []).filter((_, i) => i !== idx);
                              return { ...s, customProviders: arr, customProvider: arr[0] || s.customProvider };
                            });
                          }}
                          style={{ color: 'var(--red)', padding: '4px 8px' }}
                        >
                          حذف
                        </button>
                      </div>
                    </div>
                    <label>Provider ID</label>
                    <input
                      placeholder="custom_groq_1"
                      value={cp.id}
                      onChange={(e) => {
                        const v = e.target.value;
                        setLocal((s) => {
                          const arr = [...(s.customProviders || [])];
                          arr[idx] = { ...arr[idx], id: v };
                          return { ...s, customProviders: arr, customProvider: arr[0] || s.customProvider };
                        });
                      }}
                    />
                    <label>Display Name</label>
                    <input
                      placeholder="Groq Llama 3.3 — Tier-2 #1"
                      value={cp.displayName}
                      onChange={(e) => {
                        const v = e.target.value;
                        setLocal((s) => {
                          const arr = [...(s.customProviders || [])];
                          arr[idx] = { ...arr[idx], displayName: v };
                          return { ...s, customProviders: arr, customProvider: arr[0] || s.customProvider };
                        });
                      }}
                    />
                    <label>Base URL</label>
                    <input
                      placeholder="https://api.groq.com/openai/v1"
                      value={cp.baseUrl}
                      onChange={(e) => {
                        const v = e.target.value;
                        setLocal((s) => {
                          const arr = [...(s.customProviders || [])];
                          arr[idx] = { ...arr[idx], baseUrl: v };
                          return { ...s, customProviders: arr, customProvider: arr[0] || s.customProvider };
                        });
                      }}
                    />
                    <label>API Key</label>
                    <input
                      type="password"
                      placeholder="sk-… / gsk_…"
                      value={cp.apiKey}
                      onChange={(e) => {
                        const v = e.target.value;
                        setLocal((s) => {
                          const arr = [...(s.customProviders || [])];
                          arr[idx] = { ...arr[idx], apiKey: v };
                          return { ...s, customProviders: arr, customProvider: arr[0] || s.customProvider };
                        });
                      }}
                    />
                    <label>Model IDs (comma separated)</label>
                    <input
                      placeholder="llama-3.3-70b-versatile, deepseek-v3, gpt-5"
                      value={(cp.models || []).join(', ')}
                      onChange={(e) => {
                        const models = e.target.value.split(',').map((x) => x.trim()).filter(Boolean);
                        setLocal((s) => {
                          const arr = [...(s.customProviders || [])];
                          arr[idx] = { ...arr[idx], models };
                          return { ...s, customProviders: arr, customProvider: arr[0] || s.customProvider };
                        });
                      }}
                    />
                    <label>Custom Headers (one per line: Header: Value)</label>
                    <textarea
                      rows={2}
                      placeholder="X-Custom: my-value"
                      value={Object.entries(cp.headers || {}).map(([k, v]) => `${k}: ${v}`).join('\n')}
                      onChange={(e) => {
                        const headers: Record<string, string> = {};
                        e.target.value.split('\n').forEach((line) => {
                          const ci = line.indexOf(':');
                          if (ci > 0) {
                            const k = line.slice(0, ci).trim();
                            const v = line.slice(ci + 1).trim();
                            if (k) headers[k] = v;
                          }
                        });
                        setLocal((s) => {
                          const arr = [...(s.customProviders || [])];
                          arr[idx] = { ...arr[idx], headers };
                          return { ...s, customProviders: arr, customProvider: arr[0] || s.customProvider };
                        });
                      }}
                    />
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <button
                        className="btn-ghost small"
                        disabled={idx === 0}
                        onClick={() => {
                          setLocal((s) => {
                            const arr = [...(s.customProviders || [])];
                            if (idx === 0) return s;
                            const tmp = arr[idx - 1];
                            arr[idx - 1] = arr[idx];
                            arr[idx] = tmp;
                            return { ...s, customProviders: arr, customProvider: arr[0] };
                          });
                        }}
                      >
                        ↑ أعلى
                      </button>
                      <button
                        className="btn-ghost small"
                        disabled={idx === (local.customProviders || []).length - 1}
                        onClick={() => {
                          setLocal((s) => {
                            const arr = [...(s.customProviders || [])];
                            if (idx >= arr.length - 1) return s;
                            const tmp = arr[idx + 1];
                            arr[idx + 1] = arr[idx];
                            arr[idx] = tmp;
                            return { ...s, customProviders: arr, customProvider: arr[0] };
                          });
                        }}
                      >
                        ↓ أسفل
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {PROVIDERS.map((p) => (
                <div className="settings-section provider-card" key={p.id}>
                  <div className="provider-title">
                    <strong>{p.label}</strong>
                    <span className="settings-hint">{p.hint}</span>
                  </div>
                  <label>API Key</label>
                  <input
                    type="password"
                    placeholder={p.id === 'ollama' ? 'not required' : 'sk-…'}
                    value={local.providers[p.id]?.apiKey || ''}
                    onChange={(e) => setProvider(p.id, { apiKey: e.target.value })}
                  />
                  <label>Model</label>
                  <input
                    list={`models-${p.id}`}
                    value={local.providers[p.id]?.model || ''}
                    onChange={(e) => setProvider(p.id, { model: e.target.value })}
                  />
                  <datalist id={`models-${p.id}`}>
                    {p.models.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                  {(p.id === 'ollama' || p.id === 'openrouter') && (
                    <>
                      <label>Base URL</label>
                      <input
                        value={local.providers[p.id]?.baseUrl || ''}
                        onChange={(e) => setProvider(p.id, { baseUrl: e.target.value })}
                        placeholder={p.id === 'ollama' ? 'http://localhost:11434' : 'https://openrouter.ai/api/v1'}
                      />
                    </>
                  )}
                </div>
              ))}
            </>
          )}

          {tab === 'failover' && <FailoverTab />}

          {tab === 'marketplace' && <MarketplaceTab />}

          {tab === 'appearance' && (
            <>
              <div className="settings-section">
                <label>{tr('language')} — {tr('languageHint').slice(0,12)}</label>
                <select
                  value={(local as unknown as { language?: string }).language || 'ar'}
                  onChange={(e) => setLocal((s) => ({ ...s, language: e.target.value as unknown as Settings['language'] }))}
                >
                  <option value="ar">العربية — Arabic (RTL)</option>
                  <option value="en">English — English (LTR)</option>
                  <option value="fr">Français — French (LTR)</option>
                  <option value="de">Deutsch — German (LTR)</option>
                  <option value="es">Español — Spanish (LTR)</option>
                </select>
                <p className="settings-hint">{tr('languageHint')}</p>
              </div>
              <div className="settings-section">
                <label>{tr('theme')}</label>
                <select
                  value={local.theme}
                  onChange={(e) => setLocal((s) => ({ ...s, theme: e.target.value }))}
                >
                  <option value="velo-dark">Velo Dark</option>
                  <option value="velo-ocean">Velo Ocean</option>
                  <option value="velo-rose">Velo Rose</option>
                  <option value="velo-light">Velo Light</option>
                  {extThemes.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <p className="settings-hint">Install more themes from the Extensions tab.</p>
              </div>
              <div className="settings-section">
                <label>{tr('fontSize')}</label>
                <input
                  type="range"
                  min={11}
                  max={22}
                  value={local.fontSize}
                  onChange={(e) => setLocal((s) => ({ ...s, fontSize: Number(e.target.value) }))}
                />
                <span className="settings-value">{local.fontSize}px</span>
              </div>
              <div className="settings-section">
                <label>{tr('tabSize')}</label>
                <select
                  value={local.tabSize}
                  onChange={(e) => setLocal((s) => ({ ...s, tabSize: Number(e.target.value) }))}
                >
                  {[2, 4, 8].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              {(
                [
                  ['wordWrap', tr('wordWrap')],
                  ['autoSave', tr('autoSave')],
                  ['formatOnSave', tr('formatOnSave')],
                  ['stickyScroll', tr('stickyScroll')],
                  ['inlayHints', tr('inlayHints')],
                  ['errorLens', tr('errorLens')],
                  ['ghostText', tr('ghostText')],
                ] as Array<[keyof Settings, string]>
              ).map(([key, label]) => (
                <div className="settings-section row" key={String(key)}>
                  <label>{label}</label>
                  <input
                    type="checkbox"
                    checked={Boolean(local[key])}
                    onChange={(e) => setLocal((s) => ({ ...s, [key]: e.target.checked }))}
                  />
                </div>
              ))}
            </>
          )}

          {tab === 'keybindings' && (
            <div className="settings-section">
              <p className="settings-hint">Click a shortcut and press the new key combination.</p>
              {Object.entries(DEFAULT_KEYBINDINGS).map(([id, def]) => (
                <KeybindingRow
                  key={id}
                  title={id}
                  value={local.keybindings?.[id] || def}
                  onChange={(v) =>
                    setLocal((s) => ({ ...s, keybindings: { ...(s.keybindings || {}), [id]: v } }))
                  }
                />
              ))}
            </div>
          )}

          {tab === 'mcp' && <McpSettings />}
          {tab === 'plugins' && <PluginsSettings />}
          {tab === 'snippets' && <SnippetsSettings />}

          {tab === 'terminal' && <TerminalSettings local={local} setLocal={setLocal} />}

          {tab === 'about' && (
            <div className="settings-about">
              <h3>Velo</h3>
              <p>AI-Powered Code Editor</p>
              <p className="settings-hint">
                Version {info?.version} · Electron {info?.electron} · {info?.platform}
              </p>
              <p className="settings-hint">
                API keys are encrypted locally with Electron safeStorage and never leave this machine except to
                the provider you choose.
              </p>
            </div>
          )}
        </div>
        </div>

        <div className="modal-footer">
          <button className="btn-ghost" onClick={() => setSettingsOpen(false)}>
            {tr('cancel')}
          </button>
          <button className="btn-primary" onClick={save}>
            {tr('saveSettings')}
          </button>
        </div>
      </div>
    </div>
  );
}
