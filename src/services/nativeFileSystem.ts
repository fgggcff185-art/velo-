import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

const ROOT_FOLDER = 'VeloProjects';
let initialized = false;
let useNative = false;

function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

export class NativeFileSystemService {
  static async initWorkspace(): Promise<void> {
    if (!isNative()) {
      useNative = false;
      return;
    }
    try {
      // Try Documents/VeloProjects
      await Filesystem.mkdir({
        path: ROOT_FOLDER,
        directory: Directory.Documents,
        recursive: true,
      });
      useNative = true;
      initialized = true;
      console.log('[NativeFS] Workspace ready at Documents/VeloProjects');
    } catch (e: any) {
      // If Documents not available, fallback to Data
      try {
        await Filesystem.mkdir({
          path: ROOT_FOLDER,
          directory: Directory.Data,
          recursive: true,
        });
        useNative = true;
        initialized = true;
        console.log('[NativeFS] Workspace ready at Data/VeloProjects (fallback)');
      } catch (err) {
        console.warn('[NativeFS] init failed, fallback to virtual', e, err);
        useNative = false;
      }
    }
  }

  private static getDir(): Directory {
    // Prefer Documents, fallback to Data if needed
    return Directory.Documents;
  }

  static isAvailable(): boolean {
    return useNative && initialized;
  }

  static async ensureInit(): Promise<void> {
    if (!initialized && isNative()) await this.initWorkspace();
  }

  static async createDirectory(folderName: string, subPath: string = ''): Promise<boolean> {
    await this.ensureInit();
    if (!this.isAvailable()) return false;
    try {
      const base = subPath ? `${ROOT_FOLDER}/${subPath}/${folderName}` : `${ROOT_FOLDER}/${folderName}`;
      await Filesystem.mkdir({
        path: base,
        directory: this.getDir(),
        recursive: true,
      });
      return true;
    } catch (error) {
      // Try Data fallback
      try {
        const base = subPath ? `${ROOT_FOLDER}/${subPath}/${folderName}` : `${ROOT_FOLDER}/${folderName}`;
        await Filesystem.mkdir({ path: base, directory: Directory.Data, recursive: true });
        return true;
      } catch (e) {
        console.error('[NativeFS] createDirectory failed:', error);
        return false;
      }
    }
  }

  static async writeFile(filePath: string, content: string): Promise<boolean> {
    await this.ensureInit();
    if (!this.isAvailable()) return false;
    try {
      // Ensure parent dir exists
      const dir = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : '';
      if (dir) {
        await Filesystem.mkdir({ path: `${ROOT_FOLDER}/${dir}`, directory: this.getDir(), recursive: true }).catch(() => {});
      }
      await Filesystem.writeFile({
        path: `${ROOT_FOLDER}/${filePath}`,
        data: content,
        directory: this.getDir(),
        encoding: Encoding.UTF8,
      });
      return true;
    } catch (error) {
      try {
        const dir = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : '';
        if (dir) await Filesystem.mkdir({ path: `${ROOT_FOLDER}/${dir}`, directory: Directory.Data, recursive: true }).catch(() => {});
        await Filesystem.writeFile({ path: `${ROOT_FOLDER}/${filePath}`, data: content, directory: Directory.Data, encoding: Encoding.UTF8 });
        return true;
      } catch (e) {
        console.error('[NativeFS] writeFile failed:', error);
        return false;
      }
    }
  }

  static async readFile(filePath: string): Promise<string | null> {
    await this.ensureInit();
    if (!this.isAvailable()) return null;
    try {
      const result = await Filesystem.readFile({
        path: `${ROOT_FOLDER}/${filePath}`,
        directory: this.getDir(),
        encoding: Encoding.UTF8,
      });
      return result.data as string;
    } catch {
      try {
        const result = await Filesystem.readFile({ path: `${ROOT_FOLDER}/${filePath}`, directory: Directory.Data, encoding: Encoding.UTF8 });
        return result.data as string;
      } catch (e) {
        return null;
      }
    }
  }

  static async deletePath(filePath: string, isDir: boolean = false): Promise<boolean> {
    await this.ensureInit();
    if (!this.isAvailable()) return false;
    try {
      if (isDir) {
        await Filesystem.rmdir({ path: `${ROOT_FOLDER}/${filePath}`, directory: this.getDir(), recursive: true });
      } else {
        await Filesystem.deleteFile({ path: `${ROOT_FOLDER}/${filePath}`, directory: this.getDir() });
      }
      return true;
    } catch {
      try {
        if (isDir) await Filesystem.rmdir({ path: `${ROOT_FOLDER}/${filePath}`, directory: Directory.Data, recursive: true });
        else await Filesystem.deleteFile({ path: `${ROOT_FOLDER}/${filePath}`, directory: Directory.Data });
        return true;
      } catch (e) {
        console.error('[NativeFS] delete failed', e);
        return false;
      }
    }
  }

  static async listFiles(subPath: string = ''): Promise<any[]> {
    await this.ensureInit();
    if (!this.isAvailable()) return [];
    const tryRead = async (dir: Directory, path: string) => {
      const result = await Filesystem.readdir({ path, directory: dir });
      return result.files;
    };
    const path = subPath ? `${ROOT_FOLDER}/${subPath}` : ROOT_FOLDER;
    try {
      const files = await tryRead(this.getDir(), path);
      return files.map((f: any) => ({
        name: f.name,
        isFile: f.type === 'file',
        isDirectory: f.type === 'directory',
        uri: f.uri,
      }));
    } catch {
      try {
        const files = await tryRead(Directory.Data, path);
        return files.map((f: any) => ({ name: f.name, isFile: f.type === 'file', isDirectory: f.type === 'directory', uri: f.uri }));
      } catch (e) {
        return [];
      }
    }
  }

  // Build a tree compatible with FileExplorer (recursive)
  static async buildTree(subPath: string = ''): Promise<any[]> {
    const entries = await this.listFiles(subPath);
    const result: any[] = [];
    for (const e of entries) {
      const relPath = subPath ? `${subPath}/${e.name}` : e.name;
      const fullPath = `/${relPath}`;
      if (e.isDirectory) {
        const children = await this.buildTree(relPath);
        result.push({ name: e.name, path: fullPath, isDirectory: true, children });
      } else {
        result.push({ name: e.name, path: fullPath, isDirectory: false });
      }
    }
    return result;
  }

  static async exists(path: string): Promise<boolean> {
    try {
      await Filesystem.stat({ path: `${ROOT_FOLDER}/${path}`, directory: this.getDir() });
      return true;
    } catch {
      try {
        await Filesystem.stat({ path: `${ROOT_FOLDER}/${path}`, directory: Directory.Data });
        return true;
      } catch { return false; }
    }
  }
}
