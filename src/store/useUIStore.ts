import { create } from 'zustand';

export type SidebarView = 'explorer' | 'search' | 'git' | 'todos' | 'outline' | 'timeline' | null;

interface TerminalTab {
  id: string;
  name: string;
  shell?: string;
}

interface PromptState {
  title: string;
  value: string;
  placeholder?: string;
}

interface ConfirmState {
  title: string;
  message: string;
  buttons: string[];
}

interface UIState {
  sidebarView: SidebarView;
  aiPanelOpen: boolean;
  terminalOpen: boolean;
  terminalTabs: TerminalTab[];
  activeTerminalId: string | null;
  paletteOpen: boolean;
  paletteMode: 'commands' | 'files';
  settingsOpen: boolean;
  zenMode: boolean;
  bottomTab: 'terminal' | 'problems';
  problemsOpen: boolean;
  splitEditor: boolean;
  aiPanelWidth: number;
  aiPanelMax: boolean;
  splitTerminal: boolean;
  toast: { text: string; kind: 'info' | 'error' | 'success' } | null;
  promptState: PromptState | null;
  confirmState: ConfirmState | null;
  setSidebarView: (v: SidebarView) => void;
  toggleSidebarView: (v: Exclude<SidebarView, null>) => void;
  setAIPanel: (open: boolean) => void;
  toggleAIPanel: () => void;
  setTerminalOpen: (open: boolean) => void;
  addTerminal: (shell?: string) => string;
  toggleZen: () => void;
  setBottomTab: (t: 'terminal' | 'problems') => void;
  setProblemsOpen: (open: boolean) => void;
  toggleSplitEditor: () => void;
  setAIPanelWidth: (w: number) => void;
  toggleAIPanelMax: () => void;
  toggleSplitTerminal: () => void;
  removeTerminal: (id: string) => void;
  setActiveTerminal: (id: string) => void;
  openPalette: (mode: 'commands' | 'files') => void;
  closePalette: () => void;
  setSettingsOpen: (open: boolean) => void;
  showToast: (text: string, kind?: 'info' | 'error' | 'success') => void;
  clearToast: () => void;
  showPrompt: (title: string, value?: string, placeholder?: string) => Promise<string | null>;
  resolvePrompt: (value: string | null) => void;
  setPromptValue: (value: string) => void;
  showConfirm: (title: string, message: string, buttons: string[]) => Promise<string | null>;
  resolveConfirm: (value: string | null) => void;
}

let termCounter = 0;

let promptResolver: ((value: string | null) => void) | null = null;
let confirmResolver: ((value: string | null) => void) | null = null;

export const useUIStore = create<UIState>()((set, get) => ({
  sidebarView: 'explorer',
  aiPanelOpen: true,
  terminalOpen: false,
  terminalTabs: [],
  activeTerminalId: null,
  paletteOpen: false,
  paletteMode: 'commands',
  settingsOpen: false,
  zenMode: false,
  bottomTab: 'terminal',
  problemsOpen: false,
  splitEditor: false,
  aiPanelWidth: 380,
  aiPanelMax: false,
  splitTerminal: false,
  toast: null,
  promptState: null,
  confirmState: null,

  setSidebarView: (v) => set({ sidebarView: v }),

  toggleSidebarView: (v) =>
    set((s) => ({ sidebarView: s.sidebarView === v ? null : v })),

  setAIPanel: (open) => set({ aiPanelOpen: open }),
  toggleAIPanel: () => set((s) => ({ aiPanelOpen: !s.aiPanelOpen })),
  setAIPanelWidth: (w) => set({ aiPanelWidth: Math.max(280, Math.min(w, window.innerWidth * 0.85)) }),
  toggleAIPanelMax: () => set((s) => ({ aiPanelMax: !s.aiPanelMax })),

  setTerminalOpen: (open) => {
    if (open && get().terminalTabs.length === 0) {
      get().addTerminal();
    }
    set({ terminalOpen: open });
  },

  addTerminal: (shell?: string) => {
    termCounter++;
    const id = `term-${termCounter}-${Date.now().toString(36)}`;
    const name = `Terminal ${termCounter}`;
    set((s) => ({
      terminalTabs: [...s.terminalTabs, { id, name, shell }],
      activeTerminalId: id,
      terminalOpen: true,
    }));
    return id;
  },

  removeTerminal: (id) => {
    void window.velo.terminalKill(id);
    set((s) => {
      const terminalTabs = s.terminalTabs.filter((t) => t.id !== id);
      const activeTerminalId =
        s.activeTerminalId === id ? terminalTabs[terminalTabs.length - 1]?.id ?? null : s.activeTerminalId;
      return { terminalTabs, activeTerminalId, terminalOpen: terminalTabs.length > 0 && s.terminalOpen };
    });
  },

  setActiveTerminal: (id) => set({ activeTerminalId: id }),

  openPalette: (mode) => set({ paletteOpen: true, paletteMode: mode }),
  closePalette: () => set({ paletteOpen: false }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),

  toggleZen: () => set((s) => ({ zenMode: !s.zenMode })),
  setBottomTab: (t) => set({ bottomTab: t }),
  setProblemsOpen: (open) => set({ problemsOpen: open }),
  toggleSplitEditor: () => set((s) => ({ splitEditor: !s.splitEditor })),
  toggleSplitTerminal: () => set((s) => ({ splitTerminal: !s.splitTerminal })),

  showToast: (text, kind = 'info') => {
    set({ toast: { text, kind } });
    setTimeout(() => {
      if (get().toast?.text === text) set({ toast: null });
    }, 3200);
  },
  clearToast: () => set({ toast: null }),

  showPrompt: (title, value = '', placeholder) => {
    if (promptResolver) promptResolver(null);
    return new Promise<string | null>((resolve) => {
      promptResolver = resolve;
      set({ promptState: { title, value, placeholder } });
    });
  },

  resolvePrompt: (value) => {
    const resolve = promptResolver;
    promptResolver = null;
    set({ promptState: null });
    resolve?.(value);
  },

  setPromptValue: (value) => {
    set((s) => (s.promptState ? { promptState: { ...s.promptState, value } } : s));
  },

  showConfirm: (title, message, buttons) => {
    if (confirmResolver) confirmResolver(null);
    return new Promise<string | null>((resolve) => {
      confirmResolver = resolve;
      set({ confirmState: { title, message, buttons } });
    });
  },

  resolveConfirm: (value) => {
    const resolve = confirmResolver;
    confirmResolver = null;
    set({ confirmState: null });
    resolve?.(value);
  },
}));
