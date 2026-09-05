import { contextBridge, ipcRenderer, IpcRendererEvent, webUtils } from 'electron';

function on<T>(channel: string, cb: (payload: T) => void): () => void {
  const handler = (_e: IpcRendererEvent, payload: T) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api = {
  // Window controls
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowMaximizeToggle: () => ipcRenderer.invoke('window:maximize-toggle'),
  windowClose: () => ipcRenderer.invoke('window:close'),
  windowForceClose: () => ipcRenderer.invoke('window:force-close'),
  onWindowMaximized: (cb: (max: boolean) => void) => on<boolean>('window:maximized', cb),
  onCloseRequest: (cb: () => void) => on<void>('app:close-request', cb),

  // Dialog / app
  openFolderDialog: () => ipcRenderer.invoke('dialog:open-folder'),
  openFileDialog: () => ipcRenderer.invoke('dialog:open-file'),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  openPath: (p: string) => ipcRenderer.invoke('shell:open-path', p),
  showItemInFolder: (p: string) => ipcRenderer.invoke('shell:show-item', p),

  // Filesystem
  readTree: (dir: string) => ipcRenderer.invoke('fs:read-tree', dir),
  readFile: (path: string) => ipcRenderer.invoke('fs:read-file', path),
  writeFile: (path: string, content: string) => ipcRenderer.invoke('fs:write-file', path, content),
  createFile: (dir: string, name: string) => ipcRenderer.invoke('fs:create-file', dir, name),
  createFolder: (dir: string, name: string) => ipcRenderer.invoke('fs:create-folder', dir, name),
  rename: (oldPath: string, newName: string) => ipcRenderer.invoke('fs:rename', oldPath, newName),
  deletePath: (path: string) => ipcRenderer.invoke('fs:delete', path),
  copyPath: (path: string) => ipcRenderer.invoke('fs:copy-path', path),
  clipboardWrite: (text: string) => ipcRenderer.invoke('clipboard:write-text', text),
  clipboardRead: () => ipcRenderer.invoke('clipboard:read-text'),
  watchFolder: (dirs: string[] | string) => ipcRenderer.invoke('fs:watch', dirs),
  unwatchFolder: () => ipcRenderer.invoke('fs:unwatch'),
  onFsChanged: (cb: (path: string) => void) => on<string>('fs:changed', cb),
  search: (root: string, query: string, opts: { regex: boolean; caseSensitive: boolean }) =>
    ipcRenderer.invoke('fs:search', root, query, opts),
  listAllFiles: (root: string) => ipcRenderer.invoke('fs:list-files', root),

  // Terminal
  terminalCreate: (id: string, cwd: string | null, cols: number, rows: number, shellPath?: string | null) =>
    ipcRenderer.invoke('terminal:create', id, cwd, cols, rows, shellPath ?? null),
  detectShells: () => ipcRenderer.invoke('terminal:detect-shells'),
  terminalWrite: (id: string, data: string) => ipcRenderer.invoke('terminal:write', id, data),
  terminalResize: (id: string, cols: number, rows: number) =>
    ipcRenderer.invoke('terminal:resize', id, cols, rows),
  terminalKill: (id: string) => ipcRenderer.invoke('terminal:kill', id),
  onTerminalData: (cb: (id: string, data: string) => void) =>
    on<{ id: string; data: string }>('terminal:data', ({ id, data }) => cb(id, data)),
  onTerminalExit: (cb: (id: string) => void) => on<string>('terminal:exit', cb),

  // Exec (git / agent commands)
  exec: (command: string, cwd: string, timeoutMs?: number) =>
    ipcRenderer.invoke('exec:run', command, cwd, timeoutMs),

  // AI
  aiChat: (req: unknown) => ipcRenderer.invoke('ai:chat', req),
  aiComplete: (req: unknown) => ipcRenderer.invoke('ai:complete', req),
  aiAbort: (streamId: string) => ipcRenderer.invoke('ai:abort', streamId),
  aiListModels: (provider: string, apiKey?: string, baseUrl?: string) =>
    ipcRenderer.invoke('ai:list-models', provider, apiKey, baseUrl),
  netFetch: (url: string, headers?: Record<string, string>) =>
    ipcRenderer.invoke('net:fetch', url, headers),
  onAIChunk: (cb: (streamId: string, chunk: string) => void) =>
    on<{ streamId: string; chunk: string }>('ai:chunk', ({ streamId, chunk }) => cb(streamId, chunk)),
  onAIDone: (cb: (streamId: string, full: string) => void) =>
    on<{ streamId: string; full: string }>('ai:done', ({ streamId, full }) => cb(streamId, full)),
  onAIError: (cb: (streamId: string, error: string) => void) =>
    on<{ streamId: string; error: string }>('ai:error', ({ streamId, error }) =>
      cb(streamId, error)
    ),

  // Store / settings
  getSettings: () => ipcRenderer.invoke('store:get'),
  setSettings: (patch: unknown) => ipcRenderer.invoke('store:set', patch),
  getAppInfo: () => ipcRenderer.invoke('app:info'),

  // History (local file versions)
  historySave: (key: string, content: string) => ipcRenderer.invoke('history:save', key, content),
  historyList: (key: string) => ipcRenderer.invoke('history:list', key),
  historyRead: (key: string, ts: number) => ipcRenderer.invoke('history:read', key, ts),

  // Plugins
  pluginsList: () => ipcRenderer.invoke('plugins:list'),
  pluginsOpenFolder: () => ipcRenderer.invoke('plugins:open-folder'),

  // DAFB MatchDB (offline-first local storage)
  dbSave: (key: string, data: unknown) => ipcRenderer.invoke('db:save', key, data),
  dbList: () => ipcRenderer.invoke('db:list'),
  dbLoad: (key: string) => ipcRenderer.invoke('db:load', key),
  dbDelete: (key: string) => ipcRenderer.invoke('db:delete', key),

  // MCP
  mcpConnect: (name: string) => ipcRenderer.invoke('mcp:connect', name),
  mcpDisconnect: (name: string) => ipcRenderer.invoke('mcp:disconnect', name),
  mcpCallTool: (name: string, tool: string, args: Record<string, unknown>) =>
    ipcRenderer.invoke('mcp:call-tool', name, tool, args),

  // Extensions marketplace (Open VSX)
  extSearch: (query: string, category?: string) => ipcRenderer.invoke('ext:search', query, category),
  extInstall: (id: string, downloadUrl: string) => ipcRenderer.invoke('ext:install', id, downloadUrl),
  extInstalled: () => ipcRenderer.invoke('ext:installed'),
  extUninstall: (id: string) => ipcRenderer.invoke('ext:uninstall', id),
  extReadFile: (relPath: string) => ipcRenderer.invoke('ext:read-file', relPath),
};

export type VeloAPI = typeof api;

contextBridge.exposeInMainWorld('velo', api);
