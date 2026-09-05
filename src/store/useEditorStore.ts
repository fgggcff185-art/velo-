import { create } from 'zustand';
import type { DiffInfo, Tab } from '../types';
import { useFileStore } from './useFileStore';
import { useUIStore } from './useUIStore';
import { useSettingsStore } from './useSettingsStore';
import { languageFromExtension } from '../services/languageMap';

function languageFromPath(p: string): string {
  return languageFromExtension(p);
}

interface EditorState {
  tabs: Tab[];
  activeTabId: string | null;
  breakpoints: Record<string, number[]>;
  formatHook: ((id: string) => Promise<void>) | null;
  openFile: (path: string, previewLine?: number) => Promise<void>;
  openDiff: (info: DiffInfo) => void;
  openHtmlPreview: (title: string, html: string) => void;
  closeTab: (id: string) => void;
  closeOthers: (id: string) => void;
  closeAll: () => void;
  setActive: (id: string) => void;
  togglePin: (id: string) => void;
  moveTab: (fromId: string, toId: string) => void;
  toggleBreakpoint: (path: string, line: number) => void;
  setFormatHook: (fn: ((id: string) => Promise<void>) | null) => void;
  updateContent: (id: string, content: string) => void;
  saveTab: (id: string) => Promise<string | null>;
  saveAll: () => Promise<string | null>;
  markSaved: (id: string, content: string) => void;
  reloadTabFromDisk: (path: string) => Promise<void>;
  activeTab: () => Tab | null;
}

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.bmp']);

const lastHistorySnapshot = new Map<string, number>();

function isPreviewFile(path: string): { binary: boolean; preview?: 'image' | 'pdf' } {
  const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
  if (IMAGE_EXTS.has(ext)) return { binary: true, preview: 'image' };
  if (ext === '.pdf') return { binary: true, preview: 'pdf' };
  return { binary: false };
}

export const useEditorStore = create<EditorState>()((set, get) => ({
  tabs: [],
  activeTabId: null,
  breakpoints: {},
  formatHook: null,

  openFile: async (path, previewLine) => {
    const existing = get().tabs.find((t) => t.path === path && t.kind === 'file');
    if (existing) {
      set({ activeTabId: existing.id });
      return;
    }
    const previewInfo = isPreviewFile(path);
    if (previewInfo.preview) {
      const name = path.split(/[\\/]/).pop() || path;
      const tab: Tab = {
        id: `file:${path}`,
        kind: 'file',
        path,
        name,
        language: 'plaintext',
        content: '',
        originalContent: '',
        dirty: false,
        binary: true,
        preview: previewInfo.preview,
      };
      set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
      return;
    }
    const res = await window.velo.readFile(path);
    if (res.error) {
      useUIStore.getState().showToast(`Cannot open file: ${res.error}`, 'error');
      return;
    }
    const name = path.split(/[\\/]/).pop() || path;
    const tab: Tab = {
      id: `file:${path}`,
      kind: 'file',
      path,
      name,
      language: languageFromPath(path),
      content: res.content,
      originalContent: res.content,
      dirty: false,
      binary: res.binary,
      truncated: res.truncated,
      previewLine,
    };
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
  },

  openDiff: (info) => {
    const id = `diff:${info.title}:${Date.now()}`;
    const tab: Tab = {
      id,
      kind: 'diff',
      path: '',
      name: info.title,
      language: info.language,
      content: info.modified,
      originalContent: info.original,
      dirty: false,
      binary: false,
      diffInfo: info,
    };
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: id }));
  },

  openHtmlPreview: (title, html) => {
    const id = `preview:${title}:${Date.now()}`;
    const tab: Tab = {
      id,
      kind: 'preview',
      path: '',
      name: `Preview — ${title}`,
      language: 'html',
      content: html,
      originalContent: html,
      dirty: false,
      binary: false,
    };
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: id }));
  },

  closeTab: (id) => {
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.id === id);
      if (idx === -1) return s;
      const tabs = s.tabs.filter((t) => t.id !== id);
      let activeTabId = s.activeTabId;
      if (s.activeTabId === id) {
        activeTabId = tabs[Math.min(idx, tabs.length - 1)]?.id ?? null;
      }
      return { tabs, activeTabId };
    });
  },

  closeOthers: (id) => {
    set((s) => ({
      tabs: s.tabs.filter((t) => t.id === id || t.pinned),
      activeTabId: id,
    }));
  },

  closeAll: () => set({ tabs: [], activeTabId: null }),

  setActive: (id) => set({ activeTabId: id }),

  togglePin: (id) => {
    set((s) => {
      const tabs = s.tabs.map((t) => (t.id === id ? { ...t, pinned: !t.pinned } : t));
      tabs.sort((a, b) => Number(b.pinned || false) - Number(a.pinned || false));
      return { tabs };
    });
  },

  moveTab: (fromId, toId) => {
    set((s) => {
      const from = s.tabs.findIndex((t) => t.id === fromId);
      const to = s.tabs.findIndex((t) => t.id === toId);
      if (from === -1 || to === -1) return s;
      const tabs = [...s.tabs];
      const [moved] = tabs.splice(from, 1);
      tabs.splice(to, 0, moved);
      return { tabs };
    });
  },

  toggleBreakpoint: (path, line) => {
    set((s) => {
      const current = s.breakpoints[path] || [];
      const next = current.includes(line) ? current.filter((l) => l !== line) : [...current, line].sort((a, b) => a - b);
      const breakpoints = { ...s.breakpoints, [path]: next };
      if (next.length === 0) delete breakpoints[path];
      return { breakpoints };
    });
  },

  setFormatHook: (fn) => set({ formatHook: fn }),

  updateContent: (id, content) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id ? { ...t, content, dirty: content !== t.originalContent } : t
      ),
    }));
  },

  saveTab: async (id) => {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab || tab.kind !== 'file' || tab.binary) return null;
    try {
      // Format on save (supported languages with a live editor attached)
      const settings = useSettingsStore.getState().settings;
      if (settings.formatOnSave && tab.dirty && get().formatHook) {
        await get().formatHook?.(id);
      }
      const fresh = get().tabs.find((t) => t.id === id);
      if (!fresh) return null;
      await window.velo.writeFile(fresh.path, fresh.content);
      get().markSaved(id, fresh.content);
      // Local history snapshot (throttled to 1 per 3 minutes per file)
      const last = lastHistorySnapshot.get(fresh.path) || 0;
      if (Date.now() - last > 3 * 60 * 1000) {
        lastHistorySnapshot.set(fresh.path, Date.now());
        void window.velo.historySave(fresh.path, fresh.content);
      }
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  },

  saveAll: async () => {
    let firstError: string | null = null;
    for (const tab of get().tabs) {
      if (tab.kind === 'file' && tab.dirty && !tab.binary) {
        try {
          await window.velo.writeFile(tab.path, tab.content);
          get().markSaved(tab.id, tab.content);
        } catch (err) {
          firstError ??= `${tab.name}: ${err instanceof Error ? err.message : String(err)}`;
        }
      }
    }
    return firstError;
  },

  markSaved: (id, content) => {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, dirty: false, originalContent: content, content } : t)),
    }));
  },

  reloadTabFromDisk: async (path) => {
    const tab = get().tabs.find((t) => t.path === path && t.kind === 'file');
    if (!tab) return;
    const res = await window.velo.readFile(path);
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tab.id && !t.dirty
          ? { ...t, content: res.content, originalContent: res.content, binary: res.binary, truncated: res.truncated }
          : t
      ),
    }));
  },

  activeTab: () => {
    const { tabs, activeTabId } = get();
    return tabs.find((t) => t.id === activeTabId) || null;
  },
}));

export function activeFileTab(): Tab | null {
  const tab = useEditorStore.getState().activeTab();
  return tab && tab.kind === 'file' && !tab.binary ? tab : null;
}

export async function saveTabWithToast(id: string | null): Promise<void> {
  if (!id) return;
  const err = await useEditorStore.getState().saveTab(id);
  const ui = useUIStore.getState();
  if (err) ui.showToast(`Save failed: ${err}`, 'error');
  else ui.showToast('File saved', 'success');
}

export async function saveAllWithToast(): Promise<void> {
  const err = await useEditorStore.getState().saveAll();
  const ui = useUIStore.getState();
  if (err) ui.showToast(`Save failed: ${err}`, 'error');
  else ui.showToast('All files saved', 'success');
}

/**
 * Closes a tab safely: auto-saves when Auto Save is enabled,
 * otherwise asks the user what to do with unsaved changes.
 * Returns true when the tab was (or already had been) closed.
 */
export async function closeTabWithSave(id: string): Promise<boolean> {
  const tab = useEditorStore.getState().tabs.find((t) => t.id === id);
  if (!tab) return true;
  if (!tab.dirty || tab.kind !== 'file' || tab.binary) {
    useEditorStore.getState().closeTab(id);
    return true;
  }
  const { autoSave } = useSettingsStore.getState().settings;
  const ui = useUIStore.getState();
  let choice: 'save' | 'discard' | 'cancel';
  if (autoSave) {
    choice = 'save';
  } else {
    const answer = await ui.showConfirm(
      'Unsaved changes',
      `Do you want to save the changes you made to ${tab.name}?`,
      ['Save', "Don't Save"]
    );
    if (answer === null) return false;
    choice = answer === 'Save' ? 'save' : 'discard';
  }
  if (choice === 'save') {
    const err = await useEditorStore.getState().saveTab(id);
    if (err) {
      ui.showToast(`Save failed: ${err}`, 'error');
      return false;
    }
  }
  useEditorStore.getState().closeTab(id);
  return true;
}

export async function openPathAndReveal(path: string, line?: number): Promise<void> {
  const parts = path.split(/[\\/]/).filter(Boolean);
  const fileStore = useFileStore.getState();
  for (let i = 0; i < parts.length - 1; i++) {
    const partial = parts.slice(0, i + 1).join('\\');
    fileStore.expandPath(partial);
  }
  await useEditorStore.getState().openFile(path, line);
}
