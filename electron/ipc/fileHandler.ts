import { ipcMain, dialog, shell, clipboard, IpcMainEvent } from 'electron';
import * as fsp from 'fs/promises';
import * as fs from 'fs';
import path from 'path';
import chokidar from 'chokidar';

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileNode[];
}

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '__pycache__',
  '.venv',
  'venv',
  '.cache',
  '.next',
  '.nuxt',
  'release',
  'dist-electron',
  '.idea',
  '.vs',
]);

const MAX_NODES = 6000;
let nodeCount = 0;

function shouldIgnore(name: string): boolean {
  return IGNORED_DIRS.has(name);
}

async function readTree(dir: string, depth: number): Promise<FileNode[]> {
  if (depth > 12 || nodeCount > MAX_NODES) return [];
  let entries: fs.Dirent[];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const nodes: FileNode[] = [];
  const folders: FileNode[] = [];
  const files: FileNode[] = [];
  for (const entry of entries) {
    if (nodeCount > MAX_NODES) break;
    if (shouldIgnore(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      nodeCount++;
      const folder: FileNode = { name: entry.name, path: full, type: 'folder', children: [] };
      folders.push(folder);
    } else if (entry.isFile()) {
      nodeCount++;
      files.push({ name: entry.name, path: full, type: 'file' });
    }
  }
  for (const folder of folders) {
    folder.children = await readTree(folder.path, depth + 1);
  }
  folders.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));
  nodes.push(...folders, ...files);
  return nodes;
}

const BINARY_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.bmp', '.webp', '.icns', '.pdf', '.zip', '.gz',
  '.tar', '.rar', '.7z', '.exe', '.dll', '.so', '.dylib', '.bin', '.dat', '.db', '.sqlite',
  '.sqlite3', '.class', '.jar', '.war', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.mp3',
  '.mp4', '.avi', '.mov', '.mkv', '.wav', '.ogg', '.wasm', '.node', '.pyc', '.pyo', '.o',
  '.obj', '.lib', '.a', '.pdb', '.suo', '.cache', '.pack', '.idx', '.lock-end',
]);

const TEXT_CAP = 4 * 1024 * 1024;

async function readTextFile(p: string): Promise<{ content: string; binary: boolean; truncated: boolean }> {
  const stat = await fsp.stat(p);
  const ext = path.extname(p).toLowerCase();
  if (BINARY_EXTS.has(ext)) {
    return { content: '', binary: true, truncated: false };
  }
  const sizeCap = Math.min(stat.size, TEXT_CAP);
  const buf = Buffer.alloc(sizeCap);
  const fd = await fsp.open(p, 'r');
  try {
    await fd.read(buf, 0, sizeCap, 0);
  } finally {
    await fd.close();
  }
  const sample = buf.subarray(0, Math.min(buf.length, 8192));
  const isBinary = sample.includes(0);
  if (isBinary) return { content: '', binary: true, truncated: false };
  return { content: buf.toString('utf8'), binary: false, truncated: stat.size > TEXT_CAP };
}

function walkFiles(
  dir: string,
  cb: (p: string) => void,
  counter: { n: number },
  max: number
): void {
  if (counter.n > max) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (counter.n > max) return;
    if (shouldIgnore(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkFiles(full, cb, counter, max);
    else if (e.isFile()) {
      counter.n++;
      cb(full);
    }
  }
}

export function registerFileHandlers(): void {
  ipcMain.handle('dialog:open-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Open Folder in Velo IDE',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('dialog:open-file', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      title: 'Attach a file',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('fs:read-tree', async (_e, dir: string) => {
    nodeCount = 0;
    const tree = await readTree(dir, 0);
    return tree;
  });

  ipcMain.handle('fs:read-file', async (_e, p: string) => {
    try {
      return await readTextFile(p);
    } catch (err) {
      return { content: '', binary: false, truncated: false, error: String(err) };
    }
  });

  ipcMain.handle('fs:write-file', async (_e, p: string, content: string) => {
    await fsp.mkdir(path.dirname(p), { recursive: true });
    await fsp.writeFile(p, content, 'utf8');
    return true;
  });

  ipcMain.handle('fs:create-file', async (_e, dir: string, name: string) => {
    const p = path.join(dir, name);
    await fsp.writeFile(p, '', { flag: 'wx' });
    return p;
  });

  ipcMain.handle('fs:create-folder', async (_e, dir: string, name: string) => {
    const p = path.join(dir, name);
    await fsp.mkdir(p, { recursive: true });
    return p;
  });

  ipcMain.handle('fs:rename', async (_e, oldPath: string, newName: string) => {
    const parent = path.dirname(oldPath);
    const newPath = path.join(parent, newName);
    await fsp.rename(oldPath, newPath);
    return newPath;
  });

  ipcMain.handle('fs:delete', async (_e, p: string) => {
    await shell.trashItem(p);
    return true;
  });

  ipcMain.handle('fs:copy-path', async (_e, p: string) => {
    clipboard.writeText(p);
    return true;
  });

  ipcMain.handle('clipboard:write-text', (_e, text: string) => {
    clipboard.writeText(String(text ?? ''));
    return true;
  });

  ipcMain.handle('clipboard:read-text', () => {
    return clipboard.readText();
  });

  ipcMain.handle('shell:open-path', async (_e, p: string) => {
    await shell.openPath(p);
    return true;
  });

  ipcMain.handle('shell:show-item', async (_e, p: string) => {
    shell.showItemInFolder(p);
    return true;
  });

  let watcher: chokidar.FSWatcher | null = null;
  let notifyTimer: NodeJS.Timeout | null = null;
  const pending = new Set<string>();

  const scheduleNotify = (sender: Electron.WebContents) => {
    if (notifyTimer) return;
    notifyTimer = setTimeout(() => {
      notifyTimer = null;
      for (const p of pending) {
        sender.send('fs:changed', p);
      }
      pending.clear();
    }, 350);
  };

  ipcMain.handle('fs:watch', async (e, dirs: string[] | string) => {
    const list = Array.isArray(dirs) ? dirs : [dirs];
    if (watcher) {
      await watcher.close();
      watcher = null;
    }
    const valid = list.filter((d) => d && fs.existsSync(d));
    if (valid.length === 0) return true;
    watcher = chokidar.watch(valid, {
      ignoreInitial: true,
      ignored: [/(^|[/\\])(node_modules|\.git)([/\\]|$)/],
      depth: 16,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
    });
    const onChange = (p: string) => {
      pending.add(p);
      scheduleNotify(e.sender);
    };
    watcher.on('add', onChange);
    watcher.on('unlink', onChange);
    watcher.on('addDir', onChange);
    watcher.on('unlinkDir', onChange);
    watcher.on('change', onChange);
    return true;
  });

  ipcMain.handle('fs:unwatch', async () => {
    if (watcher) {
      await watcher.close();
      watcher = null;
    }
    return true;
  });

  ipcMain.handle('fs:search', async (_e, root: string, query: string, opts: { regex: boolean; caseSensitive: boolean }) => {
    if (!query) return { results: [], truncated: false };
    let matcher: RegExp;
    try {
      const src = opts.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      matcher = new RegExp(src, opts.caseSensitive ? 'g' : 'gi');
    } catch {
      return { results: [], error: 'Invalid regex' };
    }
    const results: Array<{ path: string; line: number; text: string; col: number }> = [];
    const counter = { n: 0 };
    let truncated = false;
    walkFiles(
      root,
      (p) => {
        const ext = path.extname(p).toLowerCase();
        if (BINARY_EXTS.has(ext)) return;
        let stat: fs.Stats;
        try {
          stat = fs.statSync(p);
        } catch {
          return;
        }
        if (stat.size > 1024 * 1024) return;
        let content: string;
        try {
          content = fs.readFileSync(p, 'utf8');
        } catch {
          return;
        }
        if (content.includes('\0')) return;
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          matcher.lastIndex = 0;
          const m = matcher.exec(lines[i]);
          if (m) {
            if (results.length >= 1000) {
              truncated = true;
              return;
            }
            results.push({
              path: p,
              line: i + 1,
              col: m.index + 1,
              text: lines[i].trim().slice(0, 300),
            });
          }
        }
      },
      counter,
      8000
    );
    return { results, truncated };
  });

  ipcMain.handle('fs:list-files', async (_e, root: string) => {
    const files: string[] = [];
    const counter = { n: 0 };
    walkFiles(root, (p) => files.push(p), counter, 12000);
    return files;
  });
}
