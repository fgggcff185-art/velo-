import { ipcMain } from 'electron';
import { spawn, exec, ExecOptions } from 'child_process';
import * as fs from 'fs';
import os from 'os';
import path from 'path';

let pty: typeof import('node-pty') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  pty = require('node-pty');
} catch {
  pty = null; // node-pty not built for this ABI — fallback to piped mode
}

interface TermEntry {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
  kind: 'pty' | 'pipe';
}

const terminals = new Map<string, TermEntry>();

// Buffers writes that arrive before the PTY is fully created (e.g. Run button
// sending a command right after opening a new terminal tab)
const pendingWrites = new Map<string, string[]>();

function bufferWrite(id: string, data: string): void {
  const list = pendingWrites.get(id) || [];
  list.push(data);
  if (list.length > 200) list.splice(0, list.length - 200);
  pendingWrites.set(id, list);
}

function flushWrites(id: string): void {
  const list = pendingWrites.get(id);
  pendingWrites.delete(id);
  if (!list) return;
  const term = terminals.get(id);
  if (!term) return;
  for (const data of list) term.write(data);
}

function getDefaultShell(): string {
  const windir = process.env.WINDIR || 'C:\\Windows';
  const candidates = [
    'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
    path.join(windir, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    path.join(windir, 'System32', 'cmd.exe'),
  ];
  for (const c of candidates) {
    try {
      if (fs.statSync(c).isFile()) return c;
    } catch {
      /* try next */
    }
  }
  return 'powershell.exe';
}

export function registerTerminalHandlers(): void {
  ipcMain.handle('terminal:detect-shells', () => {
    const windir = process.env.WINDIR || 'C:\\Windows';
    const candidates = [
      { name: 'PowerShell 7 (pwsh)', paths: ['C:\\Program Files\\PowerShell\\7\\pwsh.exe', 'C:\\Program Files\\PowerShell\\7-preview\\pwsh.exe'] },
      { name: 'Windows PowerShell', paths: [path.join(windir, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')] },
      { name: 'Command Prompt (cmd)', paths: [path.join(windir, 'System32', 'cmd.exe')] },
      { name: 'Git Bash', paths: ['C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Program Files (x86)\\Git\\bin\\bash.exe'] },
    ];
    const shells: Array<{ name: string; path: string }> = [];
    for (const c of candidates) {
      for (const p of c.paths) {
        try {
          if (fs.statSync(p).isFile()) {
            shells.push({ name: c.name, path: p });
            break;
          }
        } catch {
          /* not installed */
        }
      }
    }
    return shells;
  });

  ipcMain.handle('terminal:create', (e, id: string, cwd: string | null, cols: number, rows: number, shellOverride: string | null) => {
    if (terminals.has(id)) return true;
    let shellPath = getDefaultShell();
    if (shellOverride && shellOverride.trim()) {
      const cand = shellOverride.trim();
      try {
        if (fs.statSync(cand).isFile()) shellPath = cand;
      } catch {
        /* invalid override (e.g. a folder) — fall back to the auto-detected shell */
      }
    }
    const workdir = cwd && fs.existsSync(cwd) ? cwd : os.homedir();
    const send = (data: string) => {
      if (!e.sender.isDestroyed()) e.sender.send('terminal:data', { id, data });
    };
    const exit = () => {
      if (!e.sender.isDestroyed()) e.sender.send('terminal:exit', id);
      terminals.delete(id);
    };

    if (pty) {
      try {
        const p = pty.spawn(shellPath, [], {
          name: 'xterm-256color',
          cols: cols || 80,
          rows: rows || 24,
          cwd: workdir,
          env: { ...process.env, TERM: 'xterm-256color' } as Record<string, string>,
        });
        p.onData(send);
        p.onExit(exit);
        terminals.set(id, {
          kind: 'pty',
          write: (d) => p.write(d),
          resize: (c, r) => {
            try {
              p.resize(c, r);
            } catch {
              /* noop */
            }
          },
          kill: () => p.kill(),
        });
        flushWrites(id);
        return true;
      } catch {
        /* fall through to pipe mode */
      }
    }

    // Fallback: piped child process (no full TTY, commands still work)
    const child = spawn(shellPath, [], {
      cwd: workdir,
      env: { ...process.env, TERM: 'dumb' },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    child.stdout?.on('data', (d: Buffer) => send(d.toString('utf8')));
    child.stderr?.on('data', (d: Buffer) => send(d.toString('utf8')));
    child.on('close', exit);
    child.on('error', exit);
    terminals.set(id, {
      kind: 'pipe',
      write: (d) => child.stdin?.write(d),
      resize: () => undefined,
      kill: () => child.kill(),
    });
    flushWrites(id);
    return true;
  });

  ipcMain.handle('terminal:write', (_e, id: string, data: string) => {
    const term = terminals.get(id);
    if (!term) {
      bufferWrite(id, data);
      return true;
    }
    term.write(data);
    return true;
  });

  ipcMain.handle('terminal:resize', (_e, id: string, cols: number, rows: number) => {
    terminals.get(id)?.resize(cols, rows);
    return true;
  });

  ipcMain.handle('terminal:kill', (_e, id: string) => {
    terminals.get(id)?.kill();
    terminals.delete(id);
    pendingWrites.delete(id);
    return true;
  });

  ipcMain.handle('exec:run', async (_e, command: string, cwd: string, timeoutMs?: number) => {
    return new Promise((resolve) => {
      const opts: ExecOptions = {
        cwd: fs.existsSync(cwd) ? cwd : os.homedir(),
        timeout: timeoutMs ?? 60000,
        maxBuffer: 10 * 1024 * 1024,
        windowsHide: true,
      };
      const child = exec(command, opts, () => undefined);
      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (d: Buffer | string) => (stdout += d.toString()));
      child.stderr?.on('data', (d: Buffer | string) => (stderr += d.toString()));
      child.on('error', (err: Error) => resolve({ stdout, stderr: stderr + err.message, code: -1 }));
      child.on('close', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
    });
  });
}
