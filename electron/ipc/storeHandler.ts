import { app, ipcMain, safeStorage } from 'electron';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import path from 'path';

export interface ProviderConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
}

export interface CustomProviderConfig {
  enabled: boolean;
  id: string;
  displayName: string;
  baseUrl: string;
  apiKey: string;
  models: string[];
  headers: Record<string, string>;
}

export interface Settings {
  providers: Record<string, ProviderConfig>;
  defaultProvider: string;
  ghostText: boolean;
  autoSave: boolean;
  formatOnSave: boolean;
  stickyScroll: boolean;
  inlayHints: boolean;
  errorLens: boolean;
  theme: string;
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
  terminalShell: string;
  keybindings: Record<string, string>;
  mcpServers: McpServerConfig[];
  failoverEnabled: boolean;
  localFallback: boolean;
  providerPool: PoolEntry[];
  customProvider: CustomProviderConfig;
  customProviders: CustomProviderConfig[];
  snippets: Record<string, Record<string, unknown>[]>;
  recentFolders: string[];
  lastFolder: string;
  session: Record<string, unknown>;
}

export interface McpServerConfig {
  name: string;
  command: string;
  args: string[];
  enabled: boolean;
}

export interface PoolEntry {
  id: string;
  provider: string;
  label: string;
  apiKey: string;
  model?: string;
  baseUrl?: string;
  priority: number;
  enabled: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  providers: {
    gemini: { apiKey: '', model: 'gemini-3.7-flash', baseUrl: '' },
    openai: { apiKey: '', model: 'gpt-5', baseUrl: '' },
    anthropic: { apiKey: '', model: 'claude-4-sonnet', baseUrl: '' },
    deepseek: { apiKey: '', model: 'deepseek-v3', baseUrl: '' },
    groq: { apiKey: '', model: 'llama-3.3-70b-versatile', baseUrl: 'https://api.groq.com/openai/v1' },
    custom: { apiKey: '', model: 'deepseek-v3', baseUrl: '' },
    ollama: { apiKey: '', model: 'qwen3:8b', baseUrl: 'http://localhost:11434' },
    openrouter: { apiKey: '', model: 'openrouter/free', baseUrl: 'https://openrouter.ai/api/v1' },
    qwen: { apiKey: '', model: 'qwen3-coder-plus', baseUrl: '' },
    zhipu: { apiKey: '', model: 'glm-4.6', baseUrl: '' },
    moonshot: { apiKey: '', model: 'kimi-k2.5', baseUrl: '' },
    minimax: { apiKey: '', model: 'abab6.5s-chat', baseUrl: '' },
    modelscope: { apiKey: '', model: 'Qwen/Qwen3-Coder-480B-A35B-Instruct', baseUrl: '' },
    siliconflow: { apiKey: '', model: 'deepseek-ai/DeepSeek-V3.2', baseUrl: '' },
  },
  defaultProvider: 'openrouter',
  ghostText: true,
  autoSave: true,
  formatOnSave: false,
  stickyScroll: true,
  inlayHints: true,
  errorLens: true,
  theme: 'velo-dark',
  fontSize: 14,
  tabSize: 2,
  wordWrap: false,
  terminalShell: '',
  keybindings: {},
  mcpServers: [],
  failoverEnabled: true,
  localFallback: true,
  providerPool: [],
  customProvider: {
    enabled: false,
    id: 'custom_openai',
    displayName: 'DeepSeek V3.2 / Groq Llama 3.3 / GPT-5',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: '',
    models: ['deepseek-v3', 'deepseek-r1', 'deepseek-v3.2', 'llama-3.3-70b-versatile', 'gpt-5', 'gemini-3.7-flash'],
    headers: {},
  },
  customProviders: [
    {
      enabled: false,
      id: 'custom_openai',
      displayName: 'DeepSeek V3.2 / Groq Llama 3.3 / GPT-5',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: '',
      models: ['deepseek-v3', 'deepseek-r1', 'deepseek-v3.2', 'llama-3.3-70b-versatile', 'gpt-5', 'gemini-3.7-flash'],
      headers: {},
    },
  ],
  snippets: {},
  recentFolders: [],
  lastFolder: '',
  session: {},
};

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'velo-settings.json');
}

const ENC_PREFIX = 'enc::';

function encryptKey(value: string): string {
  if (!value) return '';
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return ENC_PREFIX + safeStorage.encryptString(value).toString('base64');
    }
  } catch {
    /* fallthrough */
  }
  return value;
}

function decryptKey(value: string): string {
  if (!value) return '';
  if (value.startsWith(ENC_PREFIX)) {
    try {
      return safeStorage.decryptString(Buffer.from(value.slice(ENC_PREFIX.length), 'base64'));
    } catch {
      return '';
    }
  }
  return value;
}

function deepDecrypt(settings: Settings): Settings {
  const out: Settings = {
    ...settings,
    providers: {},
    customProvider: settings.customProvider ? { ...settings.customProvider, apiKey: decryptKey(settings.customProvider.apiKey || '') } : (settings as unknown as { customProvider: Settings['customProvider'] }).customProvider,
    customProviders: (settings.customProviders || []).map((c) => ({ ...c, apiKey: decryptKey(c.apiKey || '') })),
  };
  for (const [k, v] of Object.entries(settings.providers || {})) {
    out.providers[k] = { ...v, apiKey: decryptKey(v.apiKey || '') };
  }
  if (settings.customProvider) {
    out.customProvider = { ...settings.customProvider, apiKey: decryptKey(settings.customProvider.apiKey || '') };
  }
  // Fallback: if customProviders empty but customProvider exists, migrate
  if ((!out.customProviders || out.customProviders.length === 0) && out.customProvider) {
    out.customProviders = [{ ...out.customProvider }];
  }
  return out;
}

function deepEncrypt(settings: Settings): Settings {
  const out: Settings = {
    ...settings,
    providers: {},
    customProvider: settings.customProvider ? { ...settings.customProvider, apiKey: encryptKey(settings.customProvider.apiKey || '') } : settings.customProvider,
    customProviders: (settings.customProviders || []).map((c) => ({ ...c, apiKey: encryptKey(c.apiKey || '') })),
  };
  for (const [k, v] of Object.entries(settings.providers || {})) {
    out.providers[k] = { ...v, apiKey: encryptKey(v.apiKey || '') };
  }
  if (settings.customProvider) {
    out.customProvider = { ...settings.customProvider, apiKey: encryptKey(settings.customProvider.apiKey || '') };
  }
  return out;
}

function migrateRetiredModels(settings: Settings): Settings {
  const out: Settings = { ...settings, providers: { ...settings.providers } };
  if (!out.defaultProvider || out.defaultProvider === 'gemini') {
    out.defaultProvider = 'openrouter';
    if (out.providers.openrouter) out.providers.openrouter = { ...out.providers.openrouter, model: 'openrouter/free' };
  }
  const gemini = out.providers.gemini;
  if (gemini && (/^gemini-(1\.|2\.)/.test(gemini.model || '') || gemini.model === 'gemini-3.6-flash' || gemini.model === 'gemini-3.5-flash' || gemini.model === 'gemini-2.0-flash' || gemini.model === 'gemini-1.5-pro')) {
    out.providers.gemini = { ...gemini, model: 'gemini-3.7-flash' };
  }
  const openai = out.providers.openai;
  if (openai && (openai.model === 'gpt-4o-mini' || openai.model === 'gpt-4o' || openai.model === 'o3-mini' || openai.model === 'o1-preview')) {
    out.providers.openai = { ...openai, model: 'gpt-5' };
  }
  // keep gpt-4.1 and gpt-5 users as is
  const anthropic = out.providers.anthropic;
  if (anthropic && (anthropic.model === 'claude-3-5-sonnet-latest' || anthropic.model === 'claude-3-7-sonnet' || anthropic.model === 'claude-3-5-sonnet-20241022' || anthropic.model === 'claude-3-5-haiku-latest')) {
    out.providers.anthropic = { ...anthropic, model: 'claude-4-sonnet' };
  }
  const deepseek = out.providers.deepseek;
  if (deepseek && (deepseek.model === 'deepseek-chat' || deepseek.model === 'deepseek-reasoner')) {
    out.providers.deepseek = { ...deepseek, model: 'deepseek-v3' };
  }
  const openrouter = out.providers.openrouter;
  if (openrouter && (!openrouter.model || openrouter.model === 'openai/gpt-4o-mini' || openrouter.model === 'google/gemini-3.7-flash:free' || openrouter.model === 'google/gemini-2.0-flash-exp:free')) {
    out.providers.openrouter = { ...openrouter, model: 'openrouter/free' };
  }
  const ollama = out.providers.ollama;
  if (ollama && (ollama.model === 'qwen2.5-coder:32b' || ollama.model === 'qwen2.5-coder:7b' || ollama.model === 'llama3.2')) {
    out.providers.ollama = { ...ollama, model: 'qwen3:8b' };
  }
  const custom = out.providers.custom;
  if (custom && custom.model === 'deepseek-chat') {
    out.providers.custom = { ...custom, model: 'deepseek-v3' };
  }
  const qwen = out.providers.qwen;
  if (qwen && (qwen.model === 'qwen-plus' || qwen.model === 'qwen-turbo')) {
    out.providers.qwen = { ...qwen, model: 'qwen3-coder-plus' };
  }
  const moonshot = out.providers.moonshot;
  if (moonshot && moonshot.model === 'kimi-k2-preview') {
    out.providers.moonshot = { ...moonshot, model: 'kimi-k2.5' };
  }
  const siliconflow = out.providers.siliconflow;
  if (siliconflow && siliconflow.model === 'deepseek-ai/DeepSeek-V3') {
    out.providers.siliconflow = { ...siliconflow, model: 'deepseek-ai/DeepSeek-V3.2' };
  }
  // Migrate single customProvider → customProviders array if needed
  if ((!out.customProviders || out.customProviders.length === 0) && out.customProvider) {
    out.customProviders = [{ ...out.customProvider }];
  }
  // Ensure customProviders is at least DEFAULT if empty
  if (!out.customProviders) out.customProviders = [...DEFAULT_SETTINGS.customProviders];
  return out;
}

function loadSettings(): Settings {
  return loadSettingsRaw();
}

export function loadSettingsRaw(): Settings {
  try {
    if (fs.existsSync(settingsPath())) {
      const raw = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
      const merged = deepDecrypt({
        ...DEFAULT_SETTINGS,
        ...raw,
        providers: { ...DEFAULT_SETTINGS.providers, ...(raw.providers || {}) },
        customProvider: { ...DEFAULT_SETTINGS.customProvider, ...(raw.customProvider || {}) },
        customProviders: (raw.customProviders || (raw.customProvider ? [{ ...DEFAULT_SETTINGS.customProviders[0], ...raw.customProvider }] : undefined)) as unknown as CustomProviderConfig[] | undefined,
      } as Settings);
      // Ensure customProviders exists
      if (!merged.customProviders || merged.customProviders.length === 0) {
        merged.customProviders = raw.customProvider ? [{ ...DEFAULT_SETTINGS.customProviders[0], ...raw.customProvider }] : [...DEFAULT_SETTINGS.customProviders];
      }
      return migrateRetiredModels(merged);
    }
  } catch {
    /* corrupted settings - reset */
  }
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}

async function saveSettings(settings: Settings): Promise<void> {
  await fsp.writeFile(settingsPath(), JSON.stringify(deepEncrypt(settings), null, 2), 'utf8');
}

export function registerStoreHandlers(): void {
  ipcMain.handle('store:get', async () => {
    return loadSettings();
  });

  ipcMain.handle('store:set', async (_e, patch: Partial<Settings>) => {
    const current = loadSettings();
    const merged: Settings = {
      ...current,
      ...patch,
      providers: { ...current.providers, ...(patch.providers || {}) },
      session: { ...current.session, ...(patch.session || {}) },
      customProvider: patch.customProvider ? { ...current.customProvider, ...patch.customProvider } : current.customProvider,
      customProviders: (patch as unknown as { customProviders?: CustomProviderConfig[] }).customProviders ?? current.customProviders,
    };
    // Keep single customProvider in sync with first of array for backward compat
    if (merged.customProviders && merged.customProviders.length > 0) {
      merged.customProvider = { ...merged.customProviders[0] };
    }
    await saveSettings(merged);
    return true;
  });

  ipcMain.handle('app:info', () => {
    return {
      version: app.getVersion(),
      electron: process.versions.electron,
      platform: process.platform,
      userDataPath: app.getPath('userData'),
      ptyAvailable: (() => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          require('node-pty');
          return true;
        } catch {
          return false;
        }
      })(),
    };
  });

  // ===== Local file history (Timeline) =====
  function historyDir(): string {
    return path.join(app.getPath('userData'), 'history');
  }

  function safeKey(key: string): string {
    return Buffer.from(key).toString('base64url');
  }

  ipcMain.handle('history:save', async (_e, key: string, content: string) => {
    const dir = path.join(historyDir(), safeKey(key));
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(path.join(dir, `${Date.now()}.txt`), content, 'utf8');
    // keep only the latest 50 versions
    const files = (await fsp.readdir(dir)).filter((f) => f.endsWith('.txt')).sort();
    while (files.length > 50) {
      const oldest = files.shift();
      if (oldest) await fsp.unlink(path.join(dir, oldest)).catch(() => undefined);
    }
    return true;
  });

  ipcMain.handle('history:list', async (_e, key: string) => {
    const dir = path.join(historyDir(), safeKey(key));
    try {
      const files = (await fsp.readdir(dir)).filter((f) => f.endsWith('.txt')).sort().reverse();
      const versions = [];
      for (const f of files) {
        const ts = Number(f.replace('.txt', ''));
        if (!Number.isFinite(ts)) continue;
        const stat = await fsp.stat(path.join(dir, f));
        versions.push({ ts, size: stat.size });
      }
      return versions;
    } catch {
      return [];
    }
  });

  ipcMain.handle('history:read', async (_e, key: string, ts: number) => {
    try {
      return await fsp.readFile(path.join(historyDir(), safeKey(key), `${ts}.txt`), 'utf8');
    } catch {
      return '';
    }
  });

  // ===== Plugins =====
  function pluginsDir(): string {
    return path.join(app.getPath('userData'), 'plugins');
  }

  ipcMain.handle('plugins:list', async () => {
    try {
      const dir = pluginsDir();
      await fsp.mkdir(dir, { recursive: true });
      const files = (await fsp.readdir(dir)).filter((f) => f.endsWith('.js'));
      const plugins = [];
      for (const f of files) {
        const p = path.join(dir, f);
        plugins.push({ name: f.replace(/\.js$/, ''), path: p, code: await fsp.readFile(p, 'utf8') });
      }
      return plugins;
    } catch {
      return [];
    }
  });

  ipcMain.handle('plugins:open-folder', async () => {
    const { shell } = require('electron') as typeof import('electron');
    const dir = pluginsDir();
    await fsp.mkdir(dir, { recursive: true });
    shell.openPath(dir);
    return true;
  });

  // ===== DAFB MatchDB — offline-first local analysis storage =====
  function dbDir(): string {
    return path.join(app.getPath('userData'), 'dafb-db');
  }

  ipcMain.handle('db:save', async (_e, key: string, data: unknown) => {
    const dir = dbDir();
    await fsp.mkdir(dir, { recursive: true });
    const safe = Buffer.from(key).toString('base64url').slice(0, 80);
    await fsp.writeFile(
      path.join(dir, `${safe}.json`),
      JSON.stringify({ key, data, ts: Date.now() }, null, 2),
      'utf8'
    );
    const files = (await fsp.readdir(dir)).filter((f) => f.endsWith('.json')).sort();
    while (files.length > 100) {
      const oldest = files.shift();
      if (oldest) await fsp.unlink(path.join(dir, oldest)).catch(() => undefined);
    }
    return true;
  });

  ipcMain.handle('db:list', async () => {
    try {
      const dir = dbDir();
      if (!fs.existsSync(dir)) return [];
      const files = (await fsp.readdir(dir)).filter((f) => f.endsWith('.json'));
      const out: Array<{ key: string; ts: number; size: number }> = [];
      for (const f of files) {
        try {
          const json = JSON.parse(await fsp.readFile(path.join(dir, f), 'utf8'));
          out.push({ key: json.key, ts: json.ts, size: f.length });
        } catch {
          /* skip */
        }
      }
      return out.sort((a, b) => b.ts - a.ts);
    } catch {
      return [];
    }
  });

  ipcMain.handle('db:load', async (_e, key: string) => {
    try {
      const safe = Buffer.from(key).toString('base64url').slice(0, 80);
      const p = path.join(dbDir(), `${safe}.json`);
      if (!fs.existsSync(p)) return null;
      const json = JSON.parse(await fsp.readFile(p, 'utf8'));
      return json.data ?? null;
    } catch {
      return null;
    }
  });

  ipcMain.handle('db:delete', async (_e, key: string) => {
    const safe = Buffer.from(key).toString('base64url').slice(0, 80);
    await fsp.rm(path.join(dbDir(), `${safe}.json`), { force: true });
    return true;
  });
}
