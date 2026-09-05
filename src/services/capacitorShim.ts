// Mobile shim for window.velo when running outside Electron (Capacitor / Browser)
// Provides no-op / localStorage fallbacks so the app doesn't crash on Android
import { Capacitor } from '@capacitor/core';
import { NativeFileSystemService } from './nativeFileSystem';
type VeloShim = Record<string, any>;

function createNoop() {
  return () => Promise.resolve(undefined);
}

function makeShim(): VeloShim {
  // Store listeners for AI streaming emulation
  const aiChunkListeners = new Set<(streamId: string, chunk: string) => void>();
  const aiDoneListeners = new Set<(streamId: string, full: string) => void>();
  const aiErrorListeners = new Set<(streamId: string, error: string) => void>();
  const fsChangedListeners = new Set<(p: string) => void>();
  const terminalDataListeners = new Set<(id: string, data: string) => void>();
  const terminalExitListeners = new Set<(id: string) => void>();

  // Settings stored in localStorage on mobile
  const SETTINGS_KEY = 'velo_settings_mobile';
  const getStoredSettings = () => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  };

  // Native FS init (Documents/VeloProjects) + fallback virtual
  let nativeReady = false;
  NativeFileSystemService.initWorkspace().then(() => { nativeReady = NativeFileSystemService.isAvailable(); }).catch(() => {});

  // In-memory virtual file system for fallback / browser demo
  const VIRTUAL_FS_KEY = 'velo_virtual_fs';
  const getVirtualFS = (): Record<string, string> => {
    try {
      const raw = localStorage.getItem(VIRTUAL_FS_KEY);
      return raw ? JSON.parse(raw) : { '/welcome.js': 'console.log("Hello from Velo Mobile!");\n', '/README.md': '# Velo Mobile\nWelcome! Files here are saved permanently via Native Filesystem.\n' };
    } catch {
      return {};
    }
  };
  const saveVirtualFS = (fs: Record<string, string>) => {
    localStorage.setItem(VIRTUAL_FS_KEY, JSON.stringify(fs));
    fsChangedListeners.forEach((cb) => cb('/'));
  };

  // Helper to stream OpenAI compatible API directly from browser (no Electron)
  async function streamBrowserAI(req: any) {
    const streamId = req.streamId;
    let base = req.baseUrl?.trim();
    let headers: Record<string, string> = { 'Content-Type': 'application/json', ...(req.headers || {}) };
    if (!base) {
      const defaults: Record<string, string> = {
        openai: 'https://api.openai.com/v1',
        deepseek: 'https://api.deepseek.com/v1',
        openrouter: 'https://openrouter.ai/api/v1',
        groq: 'https://api.groq.com/openai/v1',
        qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        zhipu: 'https://open.bigmodel.cn/api/paas/v4',
        moonshot: 'https://api.moonshot.cn/v1',
        minimax: 'https://api.minimax.chat/v1',
        modelscope: 'https://api-inference.modelscope.cn/v1',
        siliconflow: 'https://api.siliconflow.cn/v1',
      };
      base = defaults[req.provider] || 'https://api.openai.com/v1';
    }
    if (req.provider !== 'anthropic' && req.provider !== 'gemini' && req.provider !== 'ollama') {
      if (req.apiKey) headers['Authorization'] = `Bearer ${req.apiKey}`;
      if (req.provider === 'openrouter') {
        headers['HTTP-Referer'] = 'https://velo.code-editor';
        headers['X-Title'] = 'Velo Mobile';
      }
    }

    try {
      let res: Response;
      // Simple branching: most providers use /chat/completions SSE
      if (['openai', 'deepseek', 'qwen', 'zhipu', 'moonshot', 'minimax', 'modelscope', 'siliconflow', 'openrouter', 'groq', 'custom'].includes(req.provider)) {
        res = await fetch(`${base}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: req.model,
            messages: req.messages,
            temperature: req.temperature ?? 0.7,
            max_tokens: req.maxTokens ?? 4096,
            stream: true,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
        const reader = res.body?.getReader();
        if (!reader) throw new Error('No stream');
        const decoder = new TextDecoder();
        let buf = '';
        let full = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';
          for (const line of lines) {
            const t = line.trim();
            if (!t.startsWith('data:')) continue;
            const payload = t.slice(5).trim();
            if (payload === '[DONE]') break;
            if (!payload) continue;
            try {
              const json = JSON.parse(payload);
              const delta = json.choices?.[0]?.delta ?? {};
              const chunk = delta.content ?? delta.reasoning_content ?? '';
              if (chunk) {
                full += delta.content ?? '';
                aiChunkListeners.forEach((cb) => cb(streamId, chunk));
              }
            } catch {}
          }
        }
        aiDoneListeners.forEach((cb) => cb(streamId, full));
        return { ok: true };
      } else if (req.provider === 'anthropic') {
        // Anthropic via browser - may hit CORS, but try
        const system = req.messages.filter((m: any) => m.role === 'system').map((m: any) => m.content).join('\n\n');
        const msgs = req.messages.filter((m: any) => m.role !== 'system').map((m: any) => ({ role: m.role, content: m.content }));
        res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': req.apiKey || '',
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model: req.model,
            max_tokens: req.maxTokens ?? 4096,
            temperature: req.temperature ?? 0.7,
            system: system || undefined,
            messages: msgs,
            stream: true,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
        // Simplified: just read stream as SSE
        const reader = res.body?.getReader();
        if (!reader) throw new Error('No stream');
        const decoder = new TextDecoder();
        let buf = '';
        let full = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';
          for (const line of lines) {
            const t = line.trim();
            if (!t.startsWith('data:')) continue;
            const payload = t.slice(5).trim();
            if (!payload) continue;
            try {
              const json = JSON.parse(payload);
              if (json.type === 'content_block_delta' && json.delta?.text) {
                full += json.delta.text;
                aiChunkListeners.forEach((cb) => cb(streamId, json.delta.text));
              }
            } catch {}
          }
        }
        aiDoneListeners.forEach((cb) => cb(streamId, full));
        return { ok: true };
      } else {
        throw new Error(`Provider ${req.provider} not yet supported in mobile browser mode. Use OpenAI/DeepSeek/OpenRouter.`);
      }
    } catch (e: any) {
      const msg = e?.message || String(e);
      aiErrorListeners.forEach((cb) => cb(streamId, msg));
      return { error: msg };
    }
  }

  return {
    // Window
    windowMinimize: async () => {},
    windowMaximizeToggle: async () => {},
    windowClose: async () => {},
    windowForceClose: async () => {},
    onWindowMaximized: () => () => {},
    onCloseRequest: () => () => {},

    // Dialog / app - mobile: creates real folder in Documents/VeloProjects when native available
    openFolderDialog: async () => {
      try {
        const name = window.prompt(Capacitor.isNativePlatform() ? 'اسم المجلد الجديد (سيُحفظ في Documents/VeloProjects):' : 'اسم المجلد الجديد (سيتم إنشاؤه في الذاكرة):', 'my-project');
        if (!name) return null;
        const clean = name.trim().replace(/[\\/]/g, '-').slice(0, 30) || 'project';
        const path = `/${clean}`;
        if (Capacitor.isNativePlatform() && NativeFileSystemService.isAvailable()) {
          await NativeFileSystemService.createDirectory(clean, '');
          await NativeFileSystemService.writeFile(`${clean}/welcome.js`, `// ${clean}\nconsole.log("Hello from ${clean}");\n`);
          fsChangedListeners.forEach((cb) => cb(path));
          return path;
        }
        const vfs = getVirtualFS();
        if (!Object.keys(vfs).some((k) => k.startsWith(path + '/'))) {
          vfs[`${path}/welcome.js`] = `// ${clean}\nconsole.log("Hello from ${clean}");\n`;
          vfs[`${path}/README.md`] = `# ${clean}\nProject created on mobile\n`;
          saveVirtualFS(vfs);
        }
        return path;
      } catch { return null; }
    },
    openFileDialog: async () => {
      const vfs = getVirtualFS();
      const files = Object.keys(vfs);
      if (files.length === 0) return null;
      const choice = window.prompt(`اختر ملف (انسخ الاسم):\n${files.slice(0,8).join('\n')}`, files[0]);
      return choice && vfs[choice] !== undefined ? choice : null;
    },
    getPathForFile: (file: File) => (file as any).path || file.name,
    openPath: async () => {},
    showItemInFolder: async () => {},

    // Filesystem - native (Documents/VeloProjects) with virtual fallback
    readTree: async (_dir: string) => {
      if (Capacitor.isNativePlatform() && NativeFileSystemService.isAvailable()) {
        try {
          const children = await NativeFileSystemService.buildTree('');
          // Convert native tree to format expected by FileExplorer, and handle empty
          if (children.length === 0) {
            // Create welcome file if empty
            await NativeFileSystemService.writeFile('welcome.js', 'console.log("Hello from Velo Mobile!");\n');
            const fresh = await NativeFileSystemService.buildTree('');
            return [{ name: 'VeloProjects', path: '/', isDirectory: true, children: fresh }];
          }
          return [{ name: 'VeloProjects', path: '/', isDirectory: true, children }];
        } catch (e) { console.warn('Native readTree failed, fallback virtual', e); }
      }
      const vfs = getVirtualFS();
      const entries = Object.keys(vfs).map((p) => ({
        name: p.split('/').pop() || p,
        path: p,
        isDirectory: false,
        children: undefined,
      }));
      return [{ name: Capacitor.isNativePlatform() ? 'VeloProjects' : 'Mobile Workspace', path: '/', isDirectory: true, children: entries }];
    },
    readFile: async (path: string) => {
      const clean = path.replace(/^\//, '');
      if (Capacitor.isNativePlatform() && NativeFileSystemService.isAvailable()) {
        const data = await NativeFileSystemService.readFile(clean);
        if (data !== null) return { ok: true, content: data, path };
      }
      const vfs = getVirtualFS();
      if (path in vfs) return { ok: true, content: vfs[path], path };
      if (clean && `/` + clean in vfs) return { ok: true, content: vfs[`/${clean}`], path };
      const found = Object.entries(vfs).find(([k]) => k.endsWith(path) || k.endsWith(clean));
      if (found) return { ok: true, content: found[1], path };
      return { ok: false, error: 'File not found' };
    },
    writeFile: async (path: string, content: string) => {
      const clean = path.replace(/^\//, '');
      if (Capacitor.isNativePlatform() && NativeFileSystemService.isAvailable()) {
        const ok = await NativeFileSystemService.writeFile(clean, content);
        if (ok) { fsChangedListeners.forEach((cb) => cb(path)); return { ok: true }; }
      }
      const vfs = getVirtualFS();
      vfs[path] = content;
      if (clean !== path) vfs[`/${clean}`] = content;
      saveVirtualFS(vfs);
      return { ok: true };
    },
    createFile: async (dir: string, name: string) => {
      const cleanDir = dir.replace(/^\//, '').replace(/\/$/, '');
      const relPath = cleanDir ? `${cleanDir}/${name}` : name;
      const fullPath = `/${relPath}`;
      if (Capacitor.isNativePlatform() && NativeFileSystemService.isAvailable()) {
        const ok = await NativeFileSystemService.writeFile(relPath, '');
        if (ok) { fsChangedListeners.forEach((cb) => cb(fullPath)); return { ok: true, path: fullPath }; }
      }
      const p = `${dir.replace(/\/$/, '')}/${name}`;
      const vfs = getVirtualFS();
      if (vfs[p]) return { ok: false, error: 'File exists' };
      vfs[p] = '';
      saveVirtualFS(vfs);
      return { ok: true, path: p };
    },
    createFolder: async (dir: string, name: string) => {
      const cleanDir = dir.replace(/^\//, '').replace(/\/$/, '');
      const cleanName = name.trim().replace(/[\\/]/g, '-');
      const rel = cleanDir ? `${cleanDir}/${cleanName}` : cleanName;
      if (Capacitor.isNativePlatform() && NativeFileSystemService.isAvailable()) {
        const ok = await NativeFileSystemService.createDirectory(cleanName, cleanDir);
        if (ok) { fsChangedListeners.forEach((cb) => cb(`/${rel}`)); return { ok: true, path: `/${rel}` }; }
      }
      return { ok: true, path: `/${rel}` };
    },
    rename: async (oldPath: string, newName: string) => {
      const cleanOld = oldPath.replace(/^\//, '');
      // Native: copy then delete (simple)
      if (Capacitor.isNativePlatform() && NativeFileSystemService.isAvailable()) {
        const data = await NativeFileSystemService.readFile(cleanOld);
        if (data !== null) {
          const dir = cleanOld.includes('/') ? cleanOld.slice(0, cleanOld.lastIndexOf('/')) : '';
          const newRel = dir ? `${dir}/${newName}` : newName;
          const ok = await NativeFileSystemService.writeFile(newRel, data);
          if (ok) {
            await NativeFileSystemService.deletePath(cleanOld, false);
            const newPath = `/${newRel}`;
            fsChangedListeners.forEach((cb) => cb(newPath));
            return { ok: true, path: newPath };
          }
        }
      }
      const vfs = getVirtualFS();
      if (!(oldPath in vfs)) return { ok: false, error: 'Not found' };
      const newPath = oldPath.split('/').slice(0, -1).join('/') + '/' + newName;
      vfs[newPath] = vfs[oldPath];
      delete vfs[oldPath];
      saveVirtualFS(vfs);
      return { ok: true, path: newPath };
    },
    deletePath: async (path: string) => {
      const clean = path.replace(/^\//, '');
      if (Capacitor.isNativePlatform() && NativeFileSystemService.isAvailable()) {
        // Try as file first, then dir
        let ok = await NativeFileSystemService.deletePath(clean, false);
        if (!ok) ok = await NativeFileSystemService.deletePath(clean, true);
        if (ok) { fsChangedListeners.forEach((cb) => cb(path)); return { ok: true }; }
      }
      const vfs = getVirtualFS();
      delete vfs[path];
      Object.keys(vfs).forEach((k) => { if (k.startsWith(path + '/')) delete vfs[k]; });
      saveVirtualFS(vfs);
      return { ok: true };
    },
    copyPath: async () => ({ ok: true }),
    clipboardWrite: async (text: string) => { try { await navigator.clipboard.writeText(text); } catch {} },
    clipboardRead: async () => { try { return await navigator.clipboard.readText(); } catch { return ''; } },
    watchFolder: async () => {},
    unwatchFolder: async () => {},
    onFsChanged: (cb: (p: string) => void) => {
      fsChangedListeners.add(cb);
      return () => fsChangedListeners.delete(cb);
    },
    search: async (_root: string, query: string, _opts: any) => {
      const isRegex = _opts?.regex;
      let re: RegExp | null = null;
      if (isRegex) try { re = new RegExp(query, _opts?.caseSensitive ? '' : 'i'); } catch {}
      const results: any[] = [];
      // Try native first
      if (Capacitor.isNativePlatform() && NativeFileSystemService.isAvailable()) {
        try {
          const allFiles: string[] = [];
          const collect = async (sub: string) => {
            const ents = await NativeFileSystemService.listFiles(sub);
            for (const e of ents) {
              const rel = sub ? `${sub}/${e.name}` : e.name;
              if (e.isDirectory) await collect(rel);
              else allFiles.push(`/${rel}`);
            }
          };
          await collect('');
          for (const p of allFiles) {
            const clean = p.replace(/^\//, '');
            const data = await NativeFileSystemService.readFile(clean);
            if (data === null) continue;
            const lines = data.split('\n');
            lines.forEach((line, idx) => {
              const match = re ? re.test(line) : line.toLowerCase().includes(query.toLowerCase());
              if (match) results.push({ path: p, line: idx + 1, preview: line.slice(0, 120) });
            });
          }
          return results;
        } catch (e) { console.warn('native search failed', e); }
      }
      const vfs = getVirtualFS();
      for (const [path, content] of Object.entries(vfs)) {
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
          const match = re ? re.test(line) : line.toLowerCase().includes(query.toLowerCase());
          if (match) results.push({ path, line: idx + 1, preview: line.slice(0, 120) });
        });
      }
      return results;
    },
    listAllFiles: async (_root: string) => {
      if (Capacitor.isNativePlatform() && NativeFileSystemService.isAvailable()) {
        try {
          const all: string[] = [];
          const collect = async (sub: string) => {
            const ents = await NativeFileSystemService.listFiles(sub);
            for (const e of ents) {
              const rel = sub ? `${sub}/${e.name}` : e.name;
              if (e.isDirectory) await collect(rel);
              else all.push(`/${rel}`);
            }
          };
          await collect('');
          if (all.length > 0) return all;
        } catch {}
      }
      return Object.keys(getVirtualFS());
    },

    // Terminal - not supported
    terminalCreate: async () => {},
    detectShells: async () => [],
    terminalWrite: async () => {},
    terminalResize: async () => {},
    terminalKill: async () => {},
    onTerminalData: (cb: any) => { terminalDataListeners.add(cb); return () => terminalDataListeners.delete(cb); },
    onTerminalExit: (cb: any) => { terminalExitListeners.add(cb); return () => terminalExitListeners.delete(cb); },

    // Exec
    exec: async () => ({ ok: false, error: 'exec not supported on mobile', stdout: '', stderr: '' }),

    // AI - browser streaming
    aiChat: async (req: any) => streamBrowserAI(req),
    aiComplete: async (req: any) => {
      // non-streaming: do one fetch and return text
      const fakeStreamId = `complete-${Date.now()}`;
      let full = '';
      const offChunk = (sid: string, chunk: string) => { if (sid === req.streamId || sid === fakeStreamId) full += chunk; };
      aiChunkListeners.add(offChunk as any);
      const r = await streamBrowserAI({ ...req, streamId: req.streamId || fakeStreamId });
      aiChunkListeners.delete(offChunk as any);
      if ((r as any)?.error) return { error: (r as any).error };
      return { text: full };
    },
    aiAbort: async () => {},
    aiListModels: async () => ({ models: [] }),
    netFetch: async (url: string, headers?: Record<string, string>) => {
      try {
        const res = await fetch(url, { headers });
        const body = await res.text();
        if (!res.ok) return { error: `HTTP ${res.status}: ${body.slice(0, 300)}`, body };
        return { body, status: res.status };
      } catch (e: any) {
        return { error: e?.message || String(e) };
      }
    },
    onAIChunk: (cb: (sid: string, chunk: string) => void) => {
      aiChunkListeners.add(cb);
      return () => aiChunkListeners.delete(cb);
    },
    onAIDone: (cb: (sid: string, full: string) => void) => {
      aiDoneListeners.add(cb);
      return () => aiDoneListeners.delete(cb);
    },
    onAIError: (cb: (sid: string, error: string) => void) => {
      aiErrorListeners.add(cb);
      return () => aiErrorListeners.delete(cb);
    },

    // Store / settings - must return FULL settings like FALLBACK or App crashes with "reading 'undefined'"
    getSettings: async () => {
      const FALLBACK_MOBILE = {
        providers: {
          gemini: { apiKey: '', model: 'gemini-2.0-flash', baseUrl: '' },
          openai: { apiKey: '', model: 'gpt-4o', baseUrl: '' },
          anthropic: { apiKey: '', model: 'claude-3-5-sonnet-20241022', baseUrl: '' },
          deepseek: { apiKey: '', model: 'deepseek-chat', baseUrl: '' },
          groq: { apiKey: '', model: 'llama-3.3-70b-versatile', baseUrl: 'https://api.groq.com/openai/v1' },
          custom: { apiKey: '', model: 'deepseek-chat', baseUrl: '' },
          ollama: { apiKey: '', model: 'qwen3:8b', baseUrl: 'http://localhost:11434' },
          openrouter: { apiKey: '', model: 'openrouter/auto', baseUrl: 'https://openrouter.ai/api/v1' },
          qwen: { apiKey: '', model: 'qwen3-coder-plus', baseUrl: '' },
          zhipu: { apiKey: '', model: 'glm-4-plus', baseUrl: '' },
          moonshot: { apiKey: '', model: 'moonshot-v1-8k', baseUrl: '' },
          minimax: { apiKey: '', model: 'abab6.5s-chat', baseUrl: '' },
          modelscope: { apiKey: '', model: 'Qwen/Qwen3-Coder-480B-A35B-Instruct', baseUrl: '' },
          siliconflow: { apiKey: '', model: 'deepseek-ai/DeepSeek-V3', baseUrl: '' },
        },
        defaultProvider: 'openrouter',
        language: 'ar',
        ghostText: true,
        autoSave: true,
        formatOnSave: false,
        stickyScroll: true,
        inlayHints: true,
        errorLens: true,
        theme: 'velo-dark',
        fontSize: 14,
        tabSize: 2,
        wordWrap: false,
        terminalShell: '',
        keybindings: {},
        mcpServers: [],
        failoverEnabled: true,
        localFallback: true,
        providerPool: [],
        customProvider: { enabled: false, id: 'custom_openai', displayName: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', apiKey: '', models: [], headers: {} },
        customProviders: [],
        snippets: {},
        recentFolders: [],
        lastFolder: '',
        session: {},
      } as any;
      const stored = getStoredSettings();
      // Merge stored over fallback so new keys are added
      if (!stored || Object.keys(stored).length === 0) return FALLBACK_MOBILE;
      // deep merge providers
      const merged = { ...FALLBACK_MOBILE, ...stored };
      if (stored.providers) merged.providers = { ...FALLBACK_MOBILE.providers, ...stored.providers };
      return merged;
    },
    setSettings: async (patch: any) => {
      const current = getStoredSettings();
      const next = { ...current, ...patch };
      if (patch.providers) next.providers = { ...(current.providers || {}), ...patch.providers };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      return next;
    },
    getAppInfo: async () => ({ version: '2.0.0-mobile', platform: 'android', arch: 'arm64' }),

    // History
    historySave: async () => {},
    historyList: async () => [],
    historyRead: async () => '',

    // Plugins
    pluginsList: async () => [],
    pluginsOpenFolder: async () => {},

    // DB (use localStorage)
    dbSave: async (key: string, data: unknown) => {
      localStorage.setItem(`velo_db_${key}`, JSON.stringify(data));
      return { ok: true };
    },
    dbList: async () => {
      const keys: any[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith('velo_db_')) keys.push({ key: k.replace('velo_db_', ''), keyFull: k });
      }
      return keys;
    },
    dbLoad: async (key: string) => {
      const raw = localStorage.getItem(`velo_db_${key}`);
      return raw ? JSON.parse(raw) : null;
    },
    dbDelete: async (key: string) => {
      localStorage.removeItem(`velo_db_${key}`);
      return { ok: true };
    },

    // MCP
    mcpConnect: async () => ({ ok: false, error: 'MCP not supported on mobile' }),
    mcpDisconnect: async () => {},
    mcpCallTool: async () => ({ ok: false, error: 'MCP not supported on mobile' }),

    // Extensions
    extSearch: async () => ({ ok: true, results: [] }),
    extInstall: async () => ({ ok: false, error: 'Extensions not supported on mobile' }),
    extInstalled: async () => [],
    extUninstall: async () => ({ ok: false }),
    extReadFile: async () => '',
  };
}

export function installCapacitorShim() {
  const isElectron = !!(window as any).velo && typeof (window as any).velo.readTree === 'function' && navigator.userAgent.includes('Electron');
  const isCapacitor = (window as any).Capacitor !== undefined || location.protocol === 'capacitor:';
  const needsShim = !isElectron || isCapacitor || !(window as any).velo;
  
  if (needsShim && !(window as any).__veloShimInstalled) {
    // If window.velo doesn't exist, create it. If it exists but is partial, merge.
    const existing = (window as any).velo || {};
    const shim = makeShim();
    // Only fill missing methods
    for (const [k, v] of Object.entries(shim)) {
      if (!(k in existing)) existing[k] = v;
    }
    // Ensure listeners for AI still use shim's sets even if existing had them
    if (!existing.onAIChunk) existing.onAIChunk = shim.onAIChunk;
    if (!existing.onAIDone) existing.onAIDone = shim.onAIDone;
    if (!existing.onAIError) existing.onAIError = shim.onAIError;
    if (!existing.onFsChanged) existing.onFsChanged = shim.onFsChanged;

    (window as any).velo = existing;
    (window as any).__veloShimInstalled = true;
    console.log('[Velo Mobile Shim] installed - running in mobile/browser mode');
  }
}

// Auto-install immediately
if (typeof window !== 'undefined') {
  installCapacitorShim();
}
