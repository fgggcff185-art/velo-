import { ipcMain, app } from 'electron';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';
import os from 'os';

// Velo Marketplace - powered by the open Open VSX Registry (open-vsx.org).
// Search, install and uninstall VS Code ecosystem extensions.
// Fully supported types: Color Themes (converted to Velo themes) and Snippets.

interface SearchEntry {
  name: string;
  namespace: string;
  displayName?: string;
  version?: string;
  description?: string;
  downloadCount?: number;
  rating?: number;
  files?: { download?: string; icon?: string };
}

function extensionsDir(): string {
  return path.join(app.getPath('userData'), 'extensions');
}

function unzip(zipPath: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ps = spawn(
      'powershell.exe',
      ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${dest}' -Force`],
      { windowsHide: true }
    );
    let err = '';
    ps.stderr?.on('data', (d: Buffer) => {
      err += d.toString();
    });
    ps.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`Unzip failed: ${err.slice(0, 300)}`))));
    ps.on('error', reject);
  });
}

async function downloadTo(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fsp.writeFile(dest, buf);
}

export function registerExtensionsHandlers(): void {
  ipcMain.handle('ext:search', async (_e, query: string, category?: string) => {
    try {
      const params = new URLSearchParams({ size: '24', sortBy: 'downloadCount' });
      if (query) params.set('query', query);
      if (category) params.set('category', category);
      const res = await fetch(`https://open-vsx.org/api/-/search?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { extensions?: SearchEntry[] };
      const extensions = (json.extensions || []).map((e) => ({
        id: `${e.namespace}.${e.name}`,
        name: e.name,
        namespace: e.namespace,
        displayName: e.displayName || e.name,
        version: e.version,
        description: e.description,
        downloadCount: e.downloadCount,
        rating: e.rating,
        url: `https://open-vsx.org/extension/${e.namespace}/${e.name}`,
        download: e.files?.download,
        icon: e.files?.icon,
      }));
      return { extensions };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('ext:install', async (_e, id: string, downloadUrl: string) => {
    const tmpZip = path.join(os.tmpdir(), `velo-ext-${Date.now()}.zip`);
    const tmpDir = path.join(os.tmpdir(), `velo-ext-${Date.now()}`);
    try {
      if (!downloadUrl) throw new Error('No download URL for this extension');
      await downloadTo(downloadUrl, tmpZip);
      await fsp.mkdir(tmpDir, { recursive: true });
      await unzip(tmpZip, tmpDir);
      const extRoot = path.join(tmpDir, 'extension');
      const srcRoot = fs.existsSync(extRoot) ? extRoot : tmpDir;
      const pkgPath = path.join(srcRoot, 'package.json');
      if (!fs.existsSync(pkgPath)) throw new Error('Invalid VSIX - package.json not found');
      const pkg = JSON.parse(await fsp.readFile(pkgPath, 'utf8'));

      const destDir = path.join(extensionsDir(), id);
      await fsp.rm(destDir, { recursive: true, force: true });
      await fsp.mkdir(destDir, { recursive: true });
      await fsp.cp(srcRoot, destDir, { recursive: true });

      const contributes = pkg.contributes || {};
      const themes: Array<{ label: string; path: string; uiTheme?: string }> = contributes.themes || [];
      const snippets: Array<{ path: string }> = contributes.snippets || [];
      const installed = {
        id,
        name: pkg.name,
        displayName: pkg.displayName || pkg.name,
        version: pkg.version,
        publisher: pkg.publisher,
        description: pkg.description,
        themes: themes.map((t) => ({ label: t.label, path: path.join(destDir, t.path), uiTheme: t.uiTheme })),
        snippets: snippets.map((s) => path.join(destDir, s.path)),
        installedAt: Date.now(),
      };
      await fsp.writeFile(path.join(destDir, '.velo-installed.json'), JSON.stringify(installed, null, 2));
      return { installed };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    } finally {
      await fsp.unlink(tmpZip).catch(() => undefined);
      await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    }
  });

  ipcMain.handle('ext:installed', async () => {
    try {
      const dir = extensionsDir();
      if (!fs.existsSync(dir)) return { extensions: [] };
      const entries = await fsp.readdir(dir);
      const extensions: unknown[] = [];
      for (const entry of entries) {
        const metaPath = path.join(dir, entry, '.velo-installed.json');
        if (fs.existsSync(metaPath)) {
          try {
            extensions.push(JSON.parse(await fsp.readFile(metaPath, 'utf8')));
          } catch {
            // skip corrupted metadata
          }
        }
      }
      return { extensions };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('ext:uninstall', async (_e, id: string) => {
    try {
      await fsp.rm(path.join(extensionsDir(), id), { recursive: true, force: true });
      return true;
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('ext:read-file', async (_e, relPath: string) => {
    try {
      // only allow reads inside the extensions dir
      const full = path.resolve(relPath);
      if (!full.startsWith(path.resolve(extensionsDir()))) throw new Error('Access denied');
      return await fsp.readFile(full, 'utf8');
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });
}
