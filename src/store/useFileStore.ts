import { create } from 'zustand';
import type { FileNode } from '../types';
import { useSettingsStore } from './useSettingsStore';

interface FileState {
  roots: string[];
  tree: FileNode[];
  extraTrees: Record<string, FileNode[]>;
  expanded: Set<string>;
  loading: boolean;
  /** Primary root (first) — kept for compatibility with git/terminal/run */
  root: string | null;
  rootName: string;
  setRoot: (root: string | null) => Promise<void>;
  addRoot: (root: string) => Promise<void>;
  removeRoot: (root: string) => Promise<void>;
  allRoots: () => string[];
  refresh: () => Promise<void>;
  refreshExtra: (root: string) => Promise<void>;
  toggleExpanded: (path: string) => void;
  expandPath: (path: string) => void;
}

async function readTreeSafe(root: string): Promise<FileNode[]> {
  try {
    return await window.velo.readTree(root);
  } catch {
    return [];
  }
}

function nameOf(p: string): string {
  return p.split(/[\\/]/).filter(Boolean).pop() || p;
}

async function watchAll(roots: string[]): Promise<void> {
  if (roots.length > 0) await window.velo.watchFolder(roots);
}

export const useFileStore = create<FileState>()((set, get) => ({
  roots: [],
  tree: [],
  extraTrees: {},
  expanded: new Set(),
  loading: false,
  root: null,
  rootName: '',

  setRoot: async (root) => {
    set({ loading: true });
    if (!root) {
      set({ roots: [], tree: [], extraTrees: {}, root: null, rootName: '', expanded: new Set(), loading: false });
      void useSettingsStore.getState().update({ lastFolder: '' });
      return;
    }
    const tree = await readTreeSafe(root);
    const expanded = new Set<string>();
    if (tree[0]?.type === 'folder') expanded.add(tree[0].path);
    set({ roots: [root], tree, extraTrees: {}, root, rootName: nameOf(root), expanded, loading: false });
    void useSettingsStore.getState().update({ lastFolder: root });
    await watchAll([root]);
  },

  addRoot: async (root) => {
    const { roots, extraTrees } = get();
    if (!root || roots.includes(root)) return;
    const tree = await readTreeSafe(root);
    set({ roots: [...roots, root], extraTrees: { ...extraTrees, [root]: tree } });
    await watchAll(get().roots);
  },

  removeRoot: async (root) => {
    const { roots, extraTrees } = get();
    if (root === roots[0]) {
      await get().setRoot(null);
      return;
    }
    const nextExtra = { ...extraTrees };
    delete nextExtra[root];
    set({ roots: roots.filter((r) => r !== root), extraTrees: nextExtra });
    await watchAll(get().roots);
  },

  allRoots: () => get().roots,

  refresh: async () => {
    const { roots, extraTrees } = get();
    if (roots.length === 0) return;
    const tree = await readTreeSafe(roots[0]);
    const nextExtra: Record<string, FileNode[]> = {};
    for (const r of roots.slice(1)) {
      nextExtra[r] = await readTreeSafe(r);
    }
    set({ tree, extraTrees: nextExtra });
    void extraTrees;
  },

  refreshExtra: async (root) => {
    const { extraTrees } = get();
    if (extraTrees[root] === undefined) return;
    set({ extraTrees: { ...extraTrees, [root]: await readTreeSafe(root) } });
  },

  toggleExpanded: (path) => {
    const expanded = new Set(get().expanded);
    if (expanded.has(path)) expanded.delete(path);
    else expanded.add(path);
    set({ expanded });
  },

  expandPath: (path) => {
    const expanded = new Set(get().expanded);
    expanded.add(path);
    set({ expanded });
  },
}));
