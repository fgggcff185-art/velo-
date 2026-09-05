import { create } from 'zustand';
import type { AIProvider, Settings } from '../types';

interface SettingsState {
  settings: Settings;
  loaded: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<Settings>) => Promise<void>;
  provider: () => AIProvider;
  providerConfig: () => { apiKey: string; model: string; baseUrl: string };
}

const FALLBACK: Settings = {
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
  defaultProvider: 'openrouter' as const,
  language: 'ar' as const,
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

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  settings: FALLBACK,
  loaded: false,
  load: async () => {
    try {
      const settings = await window.velo.getSettings();
      set({ settings, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
  update: async (patch) => {
    const merged = { ...get().settings, ...patch };
    set({ settings: merged });
    await window.velo.setSettings(patch);
  },
  provider: () => get().settings.defaultProvider,
  providerConfig: () => {
    const s = get().settings;
    return s.providers[s.defaultProvider] || { apiKey: '', model: '', baseUrl: '' };
  },
}));
