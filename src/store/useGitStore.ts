import { create } from 'zustand';
import type { ExecResult } from '../types';

interface GitState {
  repoRoot: string | null;
  branch: string;
  changes: GitChange[];
  loading: boolean;
  refresh: () => Promise<void>;
  initRepo: () => Promise<void>;
  stageAll: () => Promise<void>;
  commit: (message: string) => Promise<string | null>;
  generateCommitMessage: () => Promise<string>;
  diffForFile: (path: string) => Promise<{ original: string; modified: string } | null>;
}

export interface GitChange {
  path: string;
  status: 'M' | 'A' | 'D' | 'U' | 'R';
  staged: boolean;
}

function rel(root: string, p: string): string {
  return p.startsWith(root) ? p.slice(root.length).replace(/^[\\/]/, '') : p;
}

function parseStatus(out: string, root: string): GitChange[] {
  const changes: GitChange[] = [];
  for (const line of out.split('\n')) {
    if (!line.trim()) continue;
    const x = line[0];
    const y = line[1];
    const file = line.slice(3).trim();
    if (!file) continue;
    const cleanFile = file.includes('->') ? file.split('->')[1].trim() : file;
    const stagedStatus = x !== ' ' && x !== '?';
    const workStatus = y !== ' ' || x === '?';
    let status: GitChange['status'] = 'M';
    if (x === '?' || y === '?') status = 'U';
    else if (x === 'A' || y === 'A') status = 'A';
    else if (x === 'D' || y === 'D') status = 'D';
    else if (x === 'R' || y === 'R') status = 'R';
    if (changes.some((c) => c.path === rel(root, cleanFile))) continue;
    changes.push({ path: rel(root, cleanFile), status, staged: stagedStatus && !workStatus });
  }
  return changes;
}

export const useGitStore = create<GitState>()((set, get) => ({
  repoRoot: null,
  branch: '',
  changes: [],
  loading: false,

  refresh: async () => {
    const { useFileStore } = await import('./useFileStore');
    const root = useFileStore.getState().root;
    if (!root) {
      set({ repoRoot: null, branch: '', changes: [] });
      return;
    }
    set({ loading: true });
    const res = await window.velo.exec('git rev-parse --is-inside-work-tree && git branch --show-current', root, 10000);
    if (res.code === 0 && res.stdout.trim()) {
      const branch = res.stdout.split('\n').map((l) => l.trim()).filter(Boolean)[1] || 'main';
      const statusRes = await window.velo.exec('git status --porcelain', root, 10000);
      set({
        repoRoot: root,
        branch,
        changes: statusRes.code === 0 ? parseStatus(statusRes.stdout, root) : [],
        loading: false,
      });
    } else {
      set({ repoRoot: null, branch: '', changes: [], loading: false });
    }
  },

  initRepo: async () => {
    const { useFileStore } = await import('./useFileStore');
    const { useUIStore } = await import('./useUIStore');
    const root = useFileStore.getState().root;
    if (!root) {
      useUIStore.getState().showToast('Open a folder first', 'error');
      return;
    }
    const check = await window.velo.exec('git --version', root, 10000);
    if (check.code !== 0) {
      useUIStore.getState().showToast('Git is not installed — download it from git-scm.com first', 'error');
      return;
    }
    const res = await window.velo.exec('git init', root);
    if (res.code === 0) {
      useUIStore.getState().showToast('Git repository initialized ✓', 'success');
    } else {
      useUIStore.getState().showToast(`git init failed: ${(res.stderr || 'unknown error').slice(0, 120)}`, 'error');
    }
    await get().refresh();
  },

  stageAll: async () => {
    const root = get().repoRoot;
    if (!root) return;
    await window.velo.exec('git add -A', root);
    await get().refresh();
  },

  commit: async (message) => {
    const root = get().repoRoot;
    if (!root || !message.trim()) return 'Empty commit message';
    await window.velo.exec('git add -A', root);
    const escaped = message.replace(/"/g, '\\"');
    const res = await window.velo.exec(`git commit -m "${escaped}"`, root);
    if (res.code === 0) {
      await get().refresh();
      return null;
    }
    return res.stderr || 'Commit failed';
  },

  generateCommitMessage: async () => {
    const root = get().repoRoot;
    if (!root) return '';
    const diffRes = await window.velo.exec('git diff HEAD --stat && git diff HEAD --unified=1', root, 20000);
    const diff = (diffRes.stdout + diffRes.stderr).slice(0, 12000);
    const { streamChat } = await import('../services/aiService');
    const { useSettingsStore } = await import('./useSettingsStore');
    const settings = useSettingsStore.getState().settings;
    const res = await streamChat(
      {
        provider: settings.defaultProvider,
        model: settings.providers[settings.defaultProvider]?.model || '',
        messages: [
          {
            role: 'system',
            content: 'You write concise git commit messages. Reply with ONE line only (max 72 chars), imperative mood, no quotes, no prefix.',
          },
          { role: 'user', content: `Write a commit message for these changes:\n\n${diff}` },
        ],
        temperature: 0.3,
        maxTokens: 60,
      },
      () => undefined
    ).promise;
    return res.full.split('\n')[0].trim();
  },

  diffForFile: async (path) => {
    const root = get().repoRoot;
    const { useFileStore } = await import('./useFileStore');
    const workspaceRoot = useFileStore.getState().root;
    if (!root || !workspaceRoot) return null;
    const full = `${workspaceRoot}\\${path.replace(/\//g, '\\')}`;
    let original = '';
    try {
      const gitPath = path.replace(/\\/g, '/').replace(/"/g, '');
      const res = await window.velo.exec(`git show HEAD:"${gitPath}"`, root, 10000);
      if (res.code === 0) original = res.stdout;
    } catch {
      original = '';
    }
    let modified = '';
    try {
      const res = await window.velo.readFile(full);
      modified = res.binary ? '' : res.content;
    } catch {
      modified = '';
    }
    return { original, modified };
  },
}));

export type { ExecResult };
