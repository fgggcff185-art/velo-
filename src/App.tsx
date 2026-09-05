import { useEffect } from 'react';
import { Titlebar } from './components/Titlebar/Titlebar';
import { Sidebar } from './components/Sidebar/Sidebar';
import { EditorArea } from './components/Editor/EditorArea';
import { TerminalPanel } from './components/Terminal/TerminalPanel';
import { AIChat } from './components/AIChat/AIChat';
import { CommandPalette } from './components/CommandPalette/CommandPalette';
import { SettingsModal } from './components/SettingsModal/SettingsModal';
import { PromptModal } from './components/PromptModal/PromptModal';
import { ConfirmModal } from './components/PromptModal/ConfirmModal';
import { ProblemsPanel, collectProblems } from './components/ProblemsPanel/ProblemsPanel';
import { GlobalContextMenu } from './components/GlobalContextMenu/GlobalContextMenu';
import { StatusBar } from './components/StatusBar/StatusBar';
import { useUIStore } from './store/useUIStore';
import { useFileStore } from './store/useFileStore';
import { useEditorStore, saveTabWithToast, saveAllWithToast } from './store/useEditorStore';
import { useSettingsStore } from './store/useSettingsStore';
import { useGitStore } from './store/useGitStore';
import { runProject } from './services/runService';
import { codeIndex } from './services/indexerService';
import { getActiveEditor, applyMonacoTheme } from './components/Editor/setupMonaco';
import { findDefinition } from './services/symbolsService';

function Toast() {
  const { toast, clearToast } = useUIStore();
  if (!toast) return null;
  return (
    <div className={`toast ${toast.kind}`} onClick={clearToast}>
      {toast.text}
    </div>
  );
}

interface ParsedBinding {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  key: string;
}

function parseBinding(binding: string): ParsedBinding | null {
  if (!binding) return null;
  const parts = binding.split('+').map((p) => p.trim());
  const key = parts.pop();
  if (!key) return null;
  return {
    ctrl: parts.some((p) => p.toLowerCase() === 'ctrl'),
    shift: parts.some((p) => p.toLowerCase() === 'shift'),
    alt: parts.some((p) => p.toLowerCase() === 'alt'),
    key: key.toLowerCase(),
  };
}

function bindingMatches(e: KeyboardEvent, b: ParsedBinding): boolean {
  const key = e.key.toLowerCase();
  return (
    b.ctrl === (e.ctrlKey || e.metaKey) &&
    b.shift === e.shiftKey &&
    b.alt === e.altKey &&
    key === b.key
  );
}

const DEFAULT_BINDINGS: Record<string, string> = {
  commandPalette: 'Ctrl+Shift+P',
  quickOpen: 'Ctrl+P',
  save: 'Ctrl+S',
  saveAll: 'Ctrl+Shift+S',
  toggleTerminal: 'Ctrl+`',
  toggleAI: 'Ctrl+I',
  toggleSidebar: 'Ctrl+B',
  globalSearch: 'Ctrl+Shift+F',
  run: 'F5',
  settings: 'Ctrl+,',
  zen: 'Ctrl+K Z',
  splitEditor: 'Ctrl+\\',
};

export default function App() {
  const {
    aiPanelOpen,
    setTerminalOpen,
    terminalOpen,
    toggleAIPanel,
    toggleSidebarView,
    openPalette,
    setSettingsOpen,
    zenMode,
    toggleZen,
    splitEditor,
    toggleSplitEditor,
    aiPanelWidth,
    setAIPanelWidth,
    aiPanelMax,
    toggleAIPanelMax,
    setSidebarView,
  } = useUIStore();
  const setRoot = useFileStore((s) => s.setRoot);
  const theme = useSettingsStore((s) => s.settings.theme);
  const language = useSettingsStore((s) => (s.settings as unknown as { language?: string }).language || 'ar');
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  }, [language]);

  // ===== Bootstrap =====
  useEffect(() => {
    (async () => {
      await useSettingsStore.getState().load();
      const settings = useSettingsStore.getState().settings;
      if (settings.lastFolder) {
        await setRoot(settings.lastFolder);
      }
      await useGitStore.getState().refresh();
      const monaco = await import('monaco-editor');
      collectProblems(monaco);
    })();
  }, [setRoot]);

  // ===== Theme =====
  useEffect(() => {
    document.documentElement.dataset.theme = theme.startsWith('ext:') ? 'velo-dark' : theme;
    if (theme.startsWith('ext:')) {
      void import('./services/themeConverterService').then(async (m) => {
        const converted = await m.resolveExtTheme(theme);
        if (converted) {
          applyMonacoTheme(converted.id);
          m.applyCssVars(converted);
        } else {
          applyMonacoTheme('velo-dark');
          m.applyCssVars(null);
        }
      });
    } else {
      applyMonacoTheme(theme);
      void import('./services/themeConverterService').then((m) => m.applyCssVars(null));
    }
  }, [theme]);

  // ===== Codebase index: rebuild on workspace change + on fs changes (debounced for performance) =====
  const roots = useFileStore((s) => s.roots);
  useEffect(() => {
    if (roots.length > 0) void codeIndex.rebuild();
  }, [roots.join('|')]);

  useEffect(() => {
    const off = window.velo.onFsChanged(() => {
      codeIndex.debouncedRebuild(4000);
    });
    return off;
  }, []);

  // ===== Save everything before the window closes =====
  useEffect(() => {
    const off = window.velo.onCloseRequest(async () => {
      const err = await useEditorStore.getState().saveAll();
      if (err) {
        useUIStore.getState().showToast(`Could not save: ${err}`, 'error');
        return;
      }
      await window.velo.windowForceClose();
    });
    return off;
  }, []);

  // ===== Go to definition / references =====
  const gotoDefinition = async () => {
    const editor = getActiveEditor();
    if (!editor) return;
    const model = editor.getModel();
    const pos = editor.getPosition();
    if (!model || !pos) return;
    const word = model.getWordAtPosition(pos);
    if (!word) return;
    const roots = useFileStore.getState().roots;
    const def = await findDefinition(roots, word.word);
    if (!def) {
      useUIStore.getState().showToast(`No definition found for "${word.word}"`, 'info');
      return;
    }
    await useEditorStore.getState().openFile(def.path, def.line);
  };

  const findReferences = async () => {
    const editor = getActiveEditor();
    if (!editor) return;
    const model = editor.getModel();
    const pos = editor.getPosition();
    if (!model || !pos) return;
    const word = model.getWordAtPosition(pos);
    if (!word) return;
    useUIStore.getState().toggleSidebarView('search');
    window.dispatchEvent(new CustomEvent('velo-run-search', { detail: { query: `\\b${word.word}\\b`, regex: true } }));
  };

  useEffect(() => {
    const defHandler = () => void gotoDefinition();
    const refsHandler = () => void findReferences();
    window.addEventListener('velo-goto-def', defHandler);
    window.addEventListener('velo-find-refs', refsHandler);
    return () => {
      window.removeEventListener('velo-goto-def', defHandler);
      window.removeEventListener('velo-find-refs', refsHandler);
    };
  }, []);

  // ===== Auto Save =====
  const autoSave = useSettingsStore((s) => s.settings.autoSave);
  useEffect(() => {
    if (!autoSave) return;
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const unsub = useEditorStore.subscribe((state) => {
      for (const tab of state.tabs) {
        if (tab.kind === 'file' && tab.dirty && !tab.binary) {
          const existing = timers.get(tab.id);
          if (existing) clearTimeout(existing);
          timers.set(
            tab.id,
            setTimeout(() => {
              timers.delete(tab.id);
              const current = useEditorStore.getState().tabs.find((t) => t.id === tab.id);
              if (current?.dirty) {
                useEditorStore.getState().saveTab(tab.id).then((err) => {
                  if (err) useUIStore.getState().showToast(`Auto-save failed: ${err}`, 'error');
                });
              }
            }, 1000)
          );
        }
      }
    });
    return () => {
      unsub();
      timers.forEach((t) => clearTimeout(t));
    };
  }, [autoSave]);

  // ===== Global keybindings =====
  const keybindings = useSettingsStore((s) => s.settings.keybindings);
  useEffect(() => {
    let chordPending = false;
    let chordTimer: ReturnType<typeof setTimeout> | null = null;

    const handlers: Record<string, () => void> = {
      commandPalette: () => openPalette('commands'),
      quickOpen: () => openPalette('files'),
      save: () => saveTabWithToast(useEditorStore.getState().activeTabId),
      saveAll: () => saveAllWithToast(),
      toggleTerminal: () => setTerminalOpen(!terminalOpen),
      toggleAI: () => toggleAIPanel(),
      toggleSidebar: () => toggleSidebarView('explorer'),
      globalSearch: () => toggleSidebarView('search'),
      run: () => runProject(),
      settings: () => setSettingsOpen(true),
      zen: () => toggleZen(),
      splitEditor: () => toggleSplitEditor(),
      gotoDefinition: () => void gotoDefinition(),
      findReferences: () => void findReferences(),
    };

    const onKey = (e: KeyboardEvent) => {
      // Chord: Ctrl+K then Z (outside the editor)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && !e.shiftKey && !e.altKey) {
        const target = e.target as HTMLElement;
        if (!target.closest('.monaco-editor')) {
          chordPending = true;
          if (chordTimer) clearTimeout(chordTimer);
          chordTimer = setTimeout(() => {
            chordPending = false;
          }, 1200);
          return; // let Ctrl+K reach the editor when focused; outside, start chord
        }
      }
      if (chordPending && e.key.toLowerCase() === 'z') {
        chordPending = false;
        e.preventDefault();
        toggleZen();
        return;
      }

      const bindings = { ...DEFAULT_BINDINGS, ...(keybindings || {}) };
      for (const [cmd, binding] of Object.entries(bindings)) {
        if (cmd === 'zen') continue;
        const parsed = parseBinding(binding);
        if (parsed && bindingMatches(e, parsed)) {
          const handler = handlers[cmd];
          if (handler) {
            e.preventDefault();
            handler();
            return;
          }
        }
      }

      // Non-remappable shortcuts
      if (!e.ctrlKey && !e.metaKey) {
        if (e.key === 'F12') {
          e.preventDefault();
          void gotoDefinition();
        } else if (e.key === 'F12' && e.shiftKey) {
          void findReferences();
        }
      }
      if (e.shiftKey && e.key === 'F12') {
        e.preventDefault();
        void findReferences();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (chordTimer) clearTimeout(chordTimer);
    };
  }, [openPalette, toggleSidebarView, setTerminalOpen, terminalOpen, toggleAIPanel, setSettingsOpen, keybindings, zenMode, splitEditor]);

  return (
    <div className={`app ${zenMode ? 'zen' : ''}`}>
      <Titlebar />
      <div className="app-main">
        <Sidebar />
        <EditorArea />
        {aiPanelOpen && !zenMode && (
          <>
            <div
              className="ai-sash"
              title="Drag to resize · double-click to reset"
              onDoubleClick={() => setAIPanelWidth(380)}
              onMouseDown={(e) => {
                e.preventDefault();
                document.body.classList.add('sashing');
                const onMove = (ev: MouseEvent) => {
                  setAIPanelWidth(window.innerWidth - ev.clientX - 4);
                };
                const onUp = () => {
                  document.body.classList.remove('sashing');
                  window.removeEventListener('mousemove', onMove);
                  window.removeEventListener('mouseup', onUp);
                };
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
              }}
            />
            <div
              className={`ai-panel ${aiPanelMax ? 'max' : ''}`}
              style={{ width: aiPanelMax ? '100%' : aiPanelWidth }}
            >
              <AIChat />
            </div>
          </>
        )}
      </div>
      <TerminalPanel />
      <ProblemsPanel />
      {!zenMode && <StatusBar />}
      <CommandPalette />
      <SettingsModal />
      <PromptModal />
      <ConfirmModal />
      <GlobalContextMenu />
      <Toast />
    </div>
  );
}
