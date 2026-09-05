import { useFileStore } from '../store/useFileStore';
import { useEditorStore } from '../store/useEditorStore';
import { useUIStore } from '../store/useUIStore';

function quote(p: string): string {
  return `"${p}"`;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const res = await window.velo.readFile(path);
    return !res.error;
  } catch {
    return false;
  }
}

export async function detectRunCommand(root: string, activeFilePath: string | null): Promise<string | null> {
  // 1. Run the active file based on its extension
  if (activeFilePath) {
    const ext = activeFilePath.split('.').pop()?.toLowerCase() || '';
    const p = quote(activeFilePath);
    const map: Record<string, string> = {
      js: `node ${p}`,
      mjs: `node ${p}`,
      cjs: `node ${p}`,
      ts: `npx tsx ${p}`,
      py: `python ${p}`,
      html: `start "" ${p}`,
      htm: `start "" ${p}`,
      ps1: `powershell -ExecutionPolicy Bypass -File ${p}`,
      go: `go run ${p}`,
      php: `php ${p}`,
      rb: `ruby ${p}`,
      c: `gcc ${p} -o a.exe; if ($?) { .\\a.exe }`,
      cpp: `g++ ${p} -o a.exe; if ($?) { .\\a.exe }`,
      rs: `rustc ${p} -o a.exe; if ($?) { .\\a.exe }`,
    };
    if (map[ext]) return map[ext];
  }

  // 2. package.json scripts
  try {
    const res = await window.velo.readFile(`${root}\\package.json`);
    if (!res.binary && res.content && !res.error) {
      const pkg = JSON.parse(res.content);
      if (pkg.scripts?.dev) return 'npm run dev';
      if (pkg.scripts?.start) return 'npm start';
    }
  } catch {
    /* no package.json */
  }

  // 3. Common python entry points
  for (const name of ['main.py', 'app.py', 'run.py']) {
    if (await fileExists(`${root}\\${name}`)) return `python ${name}`;
  }

  // 4. Static site — open index.html in the browser
  if (await fileExists(`${root}\\index.html`)) return 'start "" "index.html"';

  return null;
}

export async function runProject(): Promise<void> {
  const ui = useUIStore.getState();
  const root = useFileStore.getState().root;
  if (!root) {
    ui.showToast('Open a folder first', 'error');
    return;
  }
  const active = useEditorStore.getState().activeTab();
  const activeFilePath = active && active.kind === 'file' && !active.binary ? active.path : null;
  const command = await detectRunCommand(root, activeFilePath);
  if (!command) {
    ui.showToast('Could not detect how to run this project (no package.json / main.py / index.html)', 'error');
    return;
  }
  let termId = ui.activeTerminalId;
  if (!termId || !ui.terminalOpen) {
    termId = ui.addTerminal();
  }
  // The PTY is created asynchronously — the main process buffers writes for
  // terminals that are not ready yet, so it is safe to send immediately.
  await window.velo.terminalWrite(termId, `${command}\r`);
  ui.showToast(`Running: ${command}`, 'success');
}
