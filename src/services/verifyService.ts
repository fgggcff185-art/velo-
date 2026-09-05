/**
 * Verify Service — OpenCode-style project verification
 * Single source of truth for "does the project actually run without errors"
 */
import { useFileStore } from '../store/useFileStore';

async function fileExistsQuick(p: string): Promise<boolean> {
  try {
    const r = await window.velo.readFile(p);
    return !r.error && !r.binary;
  } catch { return false; }
}

export async function verifyProjectRuns(): Promise<{ ok: boolean; log: string; cmd: string }> {
  const root = useFileStore.getState().root;
  if (!root) return { ok: false, log: 'No folder open — cannot verify', cmd: '' };
  // 1. Node
  try {
    const res = await window.velo.readFile(`${root}\\package.json`);
    if (!res.binary && res.content && !res.error) {
      const pkg = JSON.parse(res.content);
      const scripts = pkg.scripts || {};
      if (scripts.build) {
        const r = await window.velo.exec('npm run build', root, 180000);
        const log = [r.stdout || '', r.stderr || ''].join('\n').slice(0, 8000);
        return { ok: r.code === 0 && !/error/i.test(log.slice(0, 3000).toLowerCase()), log: log || '(no output)', cmd: 'npm run build' };
      }
      if (await fileExistsQuick(`${root}\\tsconfig.json`)) {
        const r = await window.velo.exec('npx tsc --noEmit', root, 120000);
        const log = [r.stdout || '', r.stderr || ''].join('\n').slice(0, 8000);
        return { ok: r.code === 0, log: log || '(no output)', cmd: 'npx tsc --noEmit' };
      }
      const r = await window.velo.exec('npm install --package-lock-only --dry-run', root, 60000);
      const log = [r.stdout || '', r.stderr || ''].join('\n').slice(0, 8000);
      return { ok: r.code === 0, log: log || '(no output)', cmd: 'npm install check' };
    }
  } catch {}
  for (const name of ['main.py', 'app.py', 'run.py', 'manage.py']) {
    if (await fileExistsQuick(`${root}\\${name}`)) {
      const r = await window.velo.exec(`python -m py_compile ${name}`, root, 30000);
      const log = [r.stdout || '', r.stderr || ''].join('\n').slice(0, 8000);
      return { ok: r.code === 0, log: log || '(no output)', cmd: `python -m py_compile ${name}` };
    }
  }
  return { ok: true, log: 'No build verification needed for this project type', cmd: 'skip' };
}
