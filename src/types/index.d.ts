export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileNode[];
}

export type TabKind = 'file' | 'diff' | 'preview';

export interface DiffInfo {
  title: string;
  original: string;
  modified: string;
  language: string;
}

export interface Tab {
  id: string;
  kind: TabKind;
  path: string;
  name: string;
  language: string;
  content: string;
  originalContent: string;
  dirty: boolean;
  binary: boolean;
  truncated?: boolean;
  pinned?: boolean;
  preview?: 'image' | 'pdf';
  diffInfo?: DiffInfo;
  previewLine?: number;
}

export type AIProvider =
  | 'gemini' | 'openai' | 'anthropic' | 'deepseek' | 'ollama' | 'openrouter'
  | 'qwen' | 'zhipu' | 'moonshot' | 'minimax' | 'modelscope' | 'siliconflow' | 'groq' | 'custom';

export interface ProviderConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
}

export interface McpServerConfig {
  name: string;
  command: string;
  args: string[];
  enabled: boolean;
}

/** One API key/model combo in the failover pool */
export interface PoolEntry {
  id: string;
  provider: AIProvider;
  label: string;
  apiKey: string;
  model?: string;
  baseUrl?: string;
  priority: number;
  enabled: boolean;
}

export interface PoolUsage {
  requests: number;
  failures: number;
  tokens: number;
  lastUsed: number;
}

export interface Snippet {
  prefix: string;
  body: string;
  desc?: string;
}

export interface CustomProviderConfig {
  enabled: boolean;
  id: string;
  displayName: string;
  baseUrl: string;
  apiKey: string;
  models: string[];
  headers: Record<string, string>;
}

export type AppLanguage = 'ar' | 'en' | 'fr' | 'de' | 'es';
export interface Settings {
  providers: Record<string, ProviderConfig>;
  defaultProvider: AIProvider;
  language: AppLanguage;
  ghostText: boolean;
  autoSave: boolean;
  formatOnSave: boolean;
  stickyScroll: boolean;
  inlayHints: boolean;
  errorLens: boolean;
  theme: string;
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
  terminalShell: string;
  keybindings: Record<string, string>;
  mcpServers: McpServerConfig[];
  snippets: Record<string, Snippet[]>;
  failoverEnabled: boolean;
  localFallback: boolean;
  providerPool: PoolEntry[];
  customProvider: CustomProviderConfig; // deprecated single — kept for migration, use customProviders
  customProviders: CustomProviderConfig[];
  recentFolders: string[];
  lastFolder: string;
  session: Record<string, unknown>;
}

export interface HistoryVersion {
  ts: number;
  size: number;
}

export interface McpTool {
  name: string;
  description?: string;
}

export interface ProblemItem {
  resource: string;
  line: number;
  col: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
  owner: string;
}

export interface AgentStep {
  tool: string;
  input: Record<string, unknown>;
  output?: string;
  status: 'running' | 'done' | 'error';
  reverted?: boolean;
  originalContent?: string;
  targetPath?: string;
}

export interface ChatAttachment {
  name: string;
  path: string;
  content: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  ts: number;
  provider?: string;
  model?: string;
  steps?: AgentStep[];
  error?: string;
  attachments?: ChatAttachment[];
}

export interface SearchResultItem {
  path: string;
  line: number;
  col: number;
  text: string;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface AIChatRequestPayload {
  streamId: string;
  provider: AIProvider;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  headers?: Record<string, string>;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  temperature?: number;
  maxTokens?: number;
}

export interface VeloAPI {
  windowMinimize(): Promise<void>;
  windowMaximizeToggle(): Promise<boolean>;
  windowClose(): Promise<void>;
  windowForceClose(): Promise<void>;
  onWindowMaximized(cb: (max: boolean) => void): () => void;
  onCloseRequest(cb: () => void): () => void;
  openFolderDialog(): Promise<string | null>;
  openFileDialog(): Promise<string | null>;
  getPathForFile(file: File): string;
  openPath(p: string): Promise<void>;
  showItemInFolder(p: string): Promise<void>;
  readTree(dir: string): Promise<FileNode[]>;
  readFile(path: string): Promise<{ content: string; binary: boolean; truncated: boolean; error?: string }>;
  writeFile(path: string, content: string): Promise<boolean>;
  createFile(dir: string, name: string): Promise<string>;
  createFolder(dir: string, name: string): Promise<string>;
  rename(oldPath: string, newName: string): Promise<string>;
  deletePath(path: string): Promise<boolean>;
  copyPath(path: string): Promise<boolean>;
  clipboardWrite(text: string): Promise<boolean>;
  clipboardRead(): Promise<string>;
  watchFolder(dirs: string[] | string): Promise<boolean>;
  unwatchFolder(): Promise<boolean>;
  onFsChanged(cb: (path: string) => void): () => void;
  search(
    root: string,
    query: string,
    opts: { regex: boolean; caseSensitive: boolean }
  ): Promise<{ results: SearchResultItem[]; truncated: boolean; error?: string }>;
  listAllFiles(root: string): Promise<string[]>;
  terminalCreate(
    id: string,
    cwd: string | null,
    cols: number,
    rows: number,
    shellPath?: string | null
  ): Promise<boolean>;
  detectShells(): Promise<Array<{ name: string; path: string }>>;
  terminalWrite(id: string, data: string): Promise<void>;
  terminalResize(id: string, cols: number, rows: number): Promise<void>;
  terminalKill(id: string): Promise<void>;
  onTerminalData(cb: (id: string, data: string) => void): () => void;
  onTerminalExit(cb: (id: string) => void): () => void;
  exec(command: string, cwd: string, timeoutMs?: number): Promise<ExecResult>;
  aiChat(req: AIChatRequestPayload): Promise<{ ok?: boolean; error?: string; aborted?: boolean }>;
  aiComplete(
    req: Omit<AIChatRequestPayload, 'streamId'>
  ): Promise<{ text?: string; error?: string }>;
  aiAbort(streamId: string): Promise<void>;
  aiListModels(
    provider: string,
    apiKey?: string,
    baseUrl?: string
  ): Promise<{ models?: string[]; error?: string }>;
  netFetch(
    url: string,
    headers?: Record<string, string>
  ): Promise<{ body?: string; status?: number; error?: string }>;
  onAIChunk(cb: (streamId: string, chunk: string) => void): () => void;
  onAIDone(cb: (streamId: string, full: string) => void): () => void;
  onAIError(cb: (streamId: string, error: string) => void): () => void;
  getSettings(): Promise<Settings>;
  setSettings(patch: Partial<Settings>): Promise<boolean>;
  getAppInfo(): Promise<{ version: string; electron: string; platform: string; ptyAvailable: boolean; userDataPath: string }>;
  // History (local file versions)
  historySave(key: string, content: string): Promise<void>;
  historyList(key: string): Promise<HistoryVersion[]>;
  historyRead(key: string, ts: number): Promise<string>;
  // Plugins
  pluginsList(): Promise<Array<{ name: string; path: string; code: string }>>;
  pluginsOpenFolder(): Promise<void>;

  // DAFB MatchDB (offline-first local storage)
  dbSave(key: string, data: unknown): Promise<boolean>;
  dbList(): Promise<Array<{ key: string; ts: number; size: number }>>;
  dbLoad(key: string): Promise<unknown>;
  dbDelete(key: string): Promise<boolean>;
  // MCP
  mcpConnect(name: string): Promise<{ tools?: McpTool[]; error?: string }>;
  mcpDisconnect(name: string): Promise<void>;
  mcpCallTool(name: string, tool: string, args: Record<string, unknown>): Promise<{ content?: string; error?: string }>;

  // Extensions marketplace (Open VSX)
  extSearch(
    query: string,
    category?: string
  ): Promise<{
    extensions?: Array<{
      id: string;
      name: string;
      displayName?: string;
      version?: string;
      description?: string;
      downloadCount?: number;
      rating?: number;
      url?: string;
      download?: string;
      icon?: string;
    }>;
    error?: string;
  }>;
  extInstall(
    id: string,
    downloadUrl: string
  ): Promise<{
    installed?: {
      id: string;
      displayName: string;
      version?: string;
      description?: string;
      themes: Array<{ label: string; path: string; uiTheme?: string }>;
      snippets: string[];
    };
    error?: string;
  }>;
  extInstalled(): Promise<{
    extensions?: Array<{
      id: string;
      displayName: string;
      version?: string;
      description?: string;
      themes: Array<{ label: string; path: string; uiTheme?: string }>;
      snippets: string[];
    }>;
    error?: string;
  }>;
  extUninstall(id: string): Promise<boolean | { error?: string }>;
  extReadFile(relPath: string): Promise<string | { error?: string }>;
}

declare global {
  interface Window {
    velo: VeloAPI;
  }
}
