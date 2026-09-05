import { useCallback, useEffect, useRef, useState } from 'react';
import Editor, { DiffEditor } from '@monaco-editor/react';
import {
  X, Circle, Sparkles, Check, RotateCcw, Play, Pin, PinOff, Copy, SplitSquareHorizontal, File as FileIcon, Undo2, Redo2,
} from 'lucide-react';
import type { Tab } from '../../types';
import { useEditorStore, closeTabWithSave, saveTabWithToast } from '../../store/useEditorStore';
import { useUIStore } from '../../store/useUIStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useFileStore } from '../../store/useFileStore';
import {
  monaco,
  registerGhostText,
  registerAiCodeLens,
  registerSnippets,
  registerBoilerplates,
  setAiLensHandler,
  setActiveEditor,
  getActiveEditor,
  applyMonacoTheme,
} from './setupMonaco';
import { VeloLogo } from '../VeloLogo';
import { streamChat } from '../../services/aiService';
import { runProject } from '../../services/runService';
import { getDocumentSymbols } from '../../services/symbolsService';
import { tryExpandAtCursor } from '../../services/emmetLite';
import { setupErrorLens, setupTodoHighlight, setupAutoCloseTag, renameTagAtPosition } from '../../services/editorExtras';
import { useT } from '../../services/i18n';

const viewStates = new Map<string, monaco.editor.ICodeEditorViewState | null>();
const EMPTY_LINES: number[] = [];
// Persistent model cache — models survive tab switches (no disposal),
// keeping content, undo history and making switches instant. LRU capped at 30 to avoid memory bloat.
const modelCache = new Map<string, monaco.editor.ITextModel>();
const MAX_CACHED_MODELS = 30;
function cacheModel(path: string, model: monaco.editor.ITextModel): void {
  if (modelCache.size >= MAX_CACHED_MODELS && !modelCache.has(path)) {
    const oldest = modelCache.keys().next().value as string | undefined;
    if (oldest) {
      const oldModel = modelCache.get(oldest);
      try { oldModel?.dispose(); } catch {}
      modelCache.delete(oldest);
    }
  }
  modelCache.set(path, model);
}

function clampMenuPos(x: number, y: number, w = 210, h = 180): { x: number; y: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cx = Math.min(x, vw - w - 8);
  const cy = Math.min(y, vh - h - 8);
  return { x: Math.max(8, cx), y: Math.max(8, cy) };
}

function stripFences(text: string): string {
  const fence = text.match(/```[\w]*\n([\s\S]*?)```/);
  if (fence) return fence[1];
  return text.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '');
}

function fileUrl(p: string): string {
  return encodeURI(`file:///${p.replace(/\\/g, '/')}`).replace(/#/g, '%23');
}

function TabsBar() {
  const { tabs, activeTabId, setActive, moveTab, togglePin } = useEditorStore();
  const [menu, setMenu] = useState<{ x: number; y: number; tabId: string } | null>(null);
  const dragId = useRef<string | null>(null);

  useEffect(() => {
    if (!menu) return;
    const handler = () => setMenu(null);
    const onResize = () => setMenu(null);
    window.addEventListener('click', handler);
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.removeEventListener('click', handler);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [menu]);

  const menuTab = menu ? tabs.find((t) => t.id === menu.tabId) : null;
  const menuPos = menu ? clampMenuPos(menu.x, menu.y) : { x: 0, y: 0 };

  return (
    <div className="tabsbar">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`tab ${tab.id === activeTabId ? 'active' : ''} ${tab.pinned ? 'pinned' : ''}`}
          onClick={() => setActive(tab.id)}
          onAuxClick={(e) => {
            if (e.button === 1) closeTabWithSave(tab.id);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMenu({ x: e.clientX, y: e.clientY, tabId: tab.id });
          }}
          draggable
          onDragStart={() => {
            dragId.current = tab.id;
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (dragId.current && dragId.current !== tab.id) moveTab(dragId.current, tab.id);
            dragId.current = null;
          }}
          title={tab.path || tab.name}
        >
          {tab.pinned && <Pin size={10} className="tab-pin-icon" />}
          <span className={`tab-name ${tab.dirty ? 'dirty' : ''}`}>{tab.name}</span>
          <button
            className="tab-close"
            onClick={(e) => {
              e.stopPropagation();
              closeTabWithSave(tab.id);
            }}
          >
            {tab.dirty ? <Circle size={9} fill="currentColor" /> : tab.pinned ? <Pin size={11} /> : <X size={13} />}
          </button>
        </div>
      ))}
      <div className="tabsbar-actions">
        <button
          className="tb-split"
          title="Undo (Ctrl+Z)"
          onClick={() => getActiveEditor()?.trigger('keyboard', 'undo', null)}
        >
          <Undo2 size={15} />
        </button>
        <button
          className="tb-split"
          title="Redo (Ctrl+Shift+Z)"
          onClick={() => getActiveEditor()?.trigger('keyboard', 'redo', null)}
        >
          <Redo2 size={15} />
        </button>
        <button className="run-btn" title="Run project / active file (F5)" onClick={runProject}>
          <Play size={14} />
          <span>Run</span>
        </button>
        <button
          className={`tb-split ${useUIStore.getState().splitEditor ? 'on' : ''}`}
          title="Split editor"
          onClick={() => useUIStore.getState().toggleSplitEditor()}
        >
          <SplitSquareHorizontal size={15} />
        </button>
      </div>
      {menu && menuTab && (
        <div className="context-menu" style={{ left: menuPos.x, top: menuPos.y }} onClick={(e) => e.stopPropagation()}>
          <button
            className="context-menu-item"
            onClick={async () => {
              togglePin(menu.tabId);
              setMenu(null);
            }}
          >
            {menuTab.pinned ? <PinOff size={14} /> : <Pin size={14} />}
            {menuTab.pinned ? 'Unpin Tab' : 'Pin Tab'}
          </button>
          <button
            className="context-menu-item"
            onClick={async () => {
              setMenu(null);
              closeTabWithSave(menu.tabId);
            }}
          >
            <X size={14} /> Close
          </button>
          <button
            className="context-menu-item"
            onClick={() => {
              useEditorStore.getState().closeOthers(menu.tabId);
              setMenu(null);
            }}
          >
            <X size={14} /> Close Others
          </button>
          <button
            className="context-menu-item"
            onClick={() => {
              useEditorStore.getState().closeAll();
              setMenu(null);
            }}
          >
            <X size={14} /> Close All
          </button>
          {menuTab.path && (
            <button
              className="context-menu-item"
              onClick={() => {
                void window.velo.clipboardWrite(menuTab.path);
                setMenu(null);
              }}
            >
              <Copy size={14} /> Copy Path
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Welcome() {
  const setRoot = useFileStore((s) => s.setRoot);
  const tr = useT();
  return (
    <div className="welcome">
      <div className="welcome-logo">
        <VeloLogo size={84} />
      </div>
      <h1 className="welcome-title">{tr('welcomeTitle')}</h1>
      <p className="welcome-sub">{tr('welcomeSub')}</p>
      <div className="welcome-actions">
        <button className="btn-primary" onClick={async () => { const dir = await window.velo.openFolderDialog(); if (dir) setRoot(dir); }}>
          {tr('openFolderBtn')}
        </button>
        <button className="btn-ghost" onClick={() => useUIStore.getState().openPalette('commands')}>
          {tr('commandPaletteBtn')}
        </button>
        <button className="btn-ghost" onClick={() => useUIStore.getState().setSettingsOpen(true)}>
          {tr('configureProviders')}
        </button>
      </div>
      <div className="welcome-shortcuts">
        <div><kbd>Ctrl</kbd>+<kbd>P</kbd> {tr('shortcutQuickOpen')}</div>
        <div><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> {tr('shortcutCommands')}</div>
        <div><kbd>Ctrl</kbd>+<kbd>K</kbd> {tr('shortcutAIInline')}</div>
        <div><kbd>F5</kbd> {tr('shortcutRun')}</div>
        <div><kbd>Ctrl</kbd>+<kbd>I</kbd> {tr('shortcutAIChat')}</div>
        <div><kbd>F12</kbd> {tr('shortcutGotoDef')}</div>
      </div>
    </div>
  );
}

interface InlineEditState {
  top: number;
  left: number;
  originalText: string;
  range: monaco.Range;
  applied: boolean;
  newLines: number[];
}

function Breadcrumbs() {
  const tabs = useEditorStore((s) => s.tabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const [cursorLine, setCursorLine] = useState(1);
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const rootName = useFileStore((s) => s.rootName);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ line: number }>).detail;
      if (detail) setCursorLine(detail.line);
    };
    window.addEventListener('velo-cursor', handler);
    return () => window.removeEventListener('velo-cursor', handler);
  }, []);

  if (!activeTab || activeTab.kind !== 'file') return null;
  const segments = activeTab.path
    .replace(/^([a-zA-Z]:[\\/])/, '')
    .split(/[\\/]/)
    .filter(Boolean);

  let currentSymbol = '';
  try {
    const editor = getActiveEditor();
    const model = editor?.getModel();
    if (model) {
      const symbols = getDocumentSymbols(model);
      const before = symbols.filter((s) => s.line <= cursorLine);
      if (before.length) currentSymbol = before[before.length - 1].name;
    }
  } catch {
    /* ignore */
  }

  return (
    <div className="breadcrumbs">
      <span className="bc-root">{rootName}</span>
      {segments.map((s, i) => (
        <span key={i} className="bc-seg">
          <span className="bc-sep">›</span>
          {s}
        </span>
      ))}
      {currentSymbol && (
        <span className="bc-seg bc-symbol">
          <span className="bc-sep">›</span>
          {currentSymbol}
        </span>
      )}
    </div>
  );
}

function FileEditor({ tab }: { tab: Tab }) {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [inlineEdit, setInlineEdit] = useState<InlineEditState | null>(null);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const decorationsRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const bpDecorationsRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  // What the editor model currently holds. Typing is fully uncontrolled:
  // the model is the source of truth while editing; external changes
  // (reloads, agent writes) are pushed INTO the model imperatively.
  const modelContentRef = useRef(tab.content);
  const { fontSize, tabSize, wordWrap, stickyScroll, inlayHints, errorLens, theme } = useSettingsStore((s) => s.settings);
  // IMPORTANT: select the stable breakpoints map, derive per-tab list in render.
  // Selecting `s.breakpoints[tab.path] || []` would create a new array on every
  // snapshot and cause an infinite re-render loop (black screen) in zustand v5.
  const breakpointsMap = useEditorStore((s) => s.breakpoints);
  const breakpointsForTab = breakpointsMap[tab.path] ?? EMPTY_LINES;

  useEffect(() => {
    try {
      registerGhostText();
      registerAiCodeLens();
      registerSnippets();
      registerBoilerplates();
      applyMonacoTheme(theme);
    } catch (err) {
      console.error('Monaco feature registration failed:', err);
    }
  }, [theme]);

  useEffect(() => {
    return () => {
      const editor = editorRef.current;
      if (editor) {
        try {
          viewStates.set(tab.path, editor.saveViewState());
        } catch {
          /* editor already disposed */
        }
      }
    };
  }, [tab.path]);

  const runInlineEdit = useCallback(
    async (instruction: string) => {
      const editor = editorRef.current;
      if (!editor || !instruction.trim()) return;
      const model = editor.getModel();
      if (!model) return;
      const selection = editor.getSelection();
      const isEmptySel = !selection || selection.isEmpty();
      const range = isEmptySel
        ? new monaco.Range(selection!.startLineNumber, 1, selection!.startLineNumber, model.getLineMaxColumn(selection!.startLineNumber))
        : selection!;
      const code = model.getValueInRange(range);

      setBusy(true);
      const settings = useSettingsStore.getState().settings;
      const handle = streamChat(
        {
          provider: settings.defaultProvider,
          model: settings.providers[settings.defaultProvider]?.model || '',
          messages: [
            {
              role: 'system',
              content:
                'You are a code editing engine. Rewrite the given code according to the instruction. Reply with ONLY the new code, no explanations, no markdown fences. Preserve surrounding indentation style.',
            },
            {
              role: 'user',
              content: `File: ${tab.name}\nLanguage: ${tab.language}\nInstruction: ${instruction}\n\nCode:\n${code}`,
            },
          ],
          temperature: 0.2,
          maxTokens: 4000,
        },
        () => undefined
      );
      const res = await handle.promise;
      setBusy(false);
      if (res.error || !res.full.trim()) {
        useUIStore.getState().showToast(res.error || 'AI returned empty result', 'error');
        setInlineEdit(null);
        return;
      }
      const newText = stripFences(res.full.trimEnd());
      const startLine = range.startLineNumber;
      const newLineCount = newText.split('\n').length;

      editor.executeEdits('velo-ai', [{ range, text: newText, forceMoveMarkers: true }]);
      useEditorStore.getState().updateContent(tab.id, model.getValue());

      const newLines = Array.from({ length: newLineCount }, (_, i) => startLine + i);
      decorationsRef.current = editor.createDecorationsCollection(
        newLines.map((line) => ({
          range: new monaco.Range(line, 1, line, 1),
          options: {
            isWholeLine: true,
            className: 'ai-added-line',
            linesDecorationsClassName: 'ai-added-gutter',
          },
        }))
      );
      setInlineEdit((prev) =>
        prev
          ? {
              ...prev,
              applied: true,
              originalText: code,
              range,
              newLines,
            }
          : prev
      );
    },
    [tab.id, tab.name, tab.language]
  );

  const rejectEdit = useCallback(() => {
    const editor = editorRef.current;
    if (!editor || !inlineEdit) return;
    const model = editor.getModel();
    if (model) {
      const endLine = inlineEdit.newLines[inlineEdit.newLines.length - 1] ?? inlineEdit.range.endLineNumber;
      const replaceRange = new monaco.Range(
        inlineEdit.range.startLineNumber,
        1,
        endLine,
        model.getLineMaxColumn(endLine)
      );
      editor.executeEdits('velo-ai-revert', [{ range: replaceRange, text: inlineEdit.originalText, forceMoveMarkers: true }]);
      useEditorStore.getState().updateContent(tab.id, model.getValue());
    }
    decorationsRef.current?.clear();
    setInlineEdit(null);
    setPrompt('');
  }, [inlineEdit, tab.id]);

  const acceptEdit = useCallback(() => {
    decorationsRef.current?.clear();
    setInlineEdit(null);
    setPrompt('');
  }, []);

  // Breakpoint decorations
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    bpDecorationsRef.current?.clear();
    if (breakpointsForTab.length > 0) {
      bpDecorationsRef.current = editor.createDecorationsCollection(
        breakpointsForTab.map((line) => ({
          range: new monaco.Range(line, 1, line, 1),
          options: {
            isWholeLine: false,
            linesDecorationsClassName: 'bp-gutter',
            stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
          },
        }))
      );
    }
  }, [breakpointsForTab, tab.path]);

  // Push externally-changed content (disk reload / agent write) into the model
  useEffect(() => {
    if (tab.content === modelContentRef.current) return;
    modelContentRef.current = tab.content;
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model) return;
    if (model.getValue() === tab.content) return;
    model.pushEditOperations(
      [],
      [{ range: model.getFullModelRange(), text: tab.content }],
      () => null
    );
  }, [tab.content]);

  // Keep the model language in sync (extension map may resolve differently)
  useEffect(() => {
    const model = editorRef.current?.getModel();
    if (model && model.getLanguageId() !== tab.language) {
      monaco.editor.setModelLanguage(model, tab.language);
    }
  }, [tab.language]);

  const isLargeFile = tab.content.length > 120 * 1024;
  return (
    <div className="monaco-container" ref={containerRef} style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative', width: '100%', height: '100%' }}>
      <Editor
        theme={theme}
        options={{
          fontSize,
          tabSize,
          wordWrap: wordWrap ? 'on' : 'off',
          fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace",
          fontLigatures: !isLargeFile,
          minimap: { enabled: !isLargeFile, scale: 1 },
          smoothScrolling: false,
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'off',
          padding: { top: 12, bottom: 24 },
          scrollBeyondLastLine: false,
          renderLineHighlight: 'line',
          automaticLayout: true,
          bracketPairColorization: { enabled: !isLargeFile },
          guides: { bracketPairs: !isLargeFile },
          suggestSelection: 'first',
          inlineSuggest: { enabled: !isLargeFile },
          suggest: { preview: !isLargeFile },
          stickyScroll: { enabled: stickyScroll && !isLargeFile },
          inlayHints: { enabled: inlayHints && !isLargeFile ? 'on' : 'off' },
          lineNumbersMinChars: 4,
          occurrencesHighlight: isLargeFile ? 'off' : 'singleFile',
          selectionHighlight: !isLargeFile,
          folding: !isLargeFile,
          renderWhitespace: 'selection',
          quickSuggestions: !isLargeFile,
          wordBasedSuggestions: isLargeFile ? 'off' : 'currentDocument',
        }}
        onMount={(editor, m) => {
          editorRef.current = editor;
          setActiveEditor(editor);

          // ===== Model management (bypasses the lib's path/value handling) =====
          const uri = m.Uri.file(tab.path);
          let model = modelCache.get(tab.path) ?? null;
          const registered = m.editor.getModel(uri);
          if (!model || model.isDisposed()) model = registered ?? null;
          if (!model || model.isDisposed()) {
            model = m.editor.createModel(tab.content, tab.language, uri);
          } else if (model.getValue() !== tab.content) {
            model.pushEditOperations([], [{ range: model.getFullModelRange(), text: tab.content }], () => null);
          }
          if (model.getLanguageId() !== tab.language) {
            m.editor.setModelLanguage(model, tab.language);
          }
          cacheModel(tab.path, model);
          if (editor.getModel() !== model) editor.setModel(model);
          modelContentRef.current = model.getValue();

          // Direct model listener — the single source of truth for typing.
          editor.onDidChangeModelContent(() => {
            const v = editor.getValue();
            if (v !== modelContentRef.current) {
              modelContentRef.current = v;
              useEditorStore.getState().updateContent(tab.id, v);
            }
          });
          useEditorStore.getState().setFormatHook(async (id) => {
            if (id !== tab.id) return;
            await editor.getAction('editor.action.formatDocument')?.run();
          });

          const savedState = viewStates.get(tab.path);
          if (savedState) {
            editor.restoreViewState(savedState);
          }
          editor.focus();
          if (!savedState && tab.previewLine) {
            editor.revealLineInCenter(tab.previewLine);
            editor.setPosition({ lineNumber: tab.previewLine, column: 1 });
          }
          const cursorDisposable = editor.onDidChangeCursorPosition((e) => {
            window.dispatchEvent(
              new CustomEvent('velo-cursor', {
                detail: { line: e.position.lineNumber, col: e.position.column },
              })
            );
          });
          editor.onDidDispose(() => {
            cursorDisposable.dispose();
            if (getActiveEditor() === editor) setActiveEditor(null);
          });

          editor.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.KeyS, () => {
            saveTabWithToast(tab.id);
          });
          editor.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.KeyK, () => {
            const sel = editor.getSelection();
            const pos = sel && !sel.isEmpty() ? { lineNumber: sel.startLineNumber, column: 1 } : editor.getPosition();
            if (!pos) return;
            const scrolled = editor.getScrolledVisiblePosition(pos);
            if (!scrolled) return;
            setInlineEdit({
              top: scrolled.top + 4,
              left: Math.max(scrolled.left, 24),
              originalText: '',
              range: new m.Range(1, 1, 1, 1),
              applied: false,
              newLines: [],
            });
            setPrompt('');
            setTimeout(() => document.getElementById('velo-inline-input')?.focus(), 60);
          });
          // Multi-cursor advanced
          editor.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.KeyD, () => {
            editor.getAction('editor.action.addSelectionToNextFindMatch')?.run();
          });
          editor.addCommand(m.KeyMod.CtrlCmd | m.KeyMod.Shift | m.KeyCode.KeyL, () => {
            editor.getAction('editor.action.selectHighlights')?.run();
          });
          // Emmet-lite (Tab expands abbreviations in HTML files)
          editor.addCommand(m.KeyCode.Tab, () => {
            if (tab.language === 'html' && editor.getSelection()?.isEmpty()) {
              const pos = editor.getPosition();
              const model = editor.getModel();
              if (pos && model) {
                const expansion = tryExpandAtCursor(model as never, pos, m.Range as never);
                if (expansion) {
                  editor.executeEdits('velo-emmet', [
                    {
                      range: new m.Range(
                        expansion.range.startLineNumber,
                        expansion.range.startColumn,
                        expansion.range.endLineNumber,
                        expansion.range.endColumn
                      ),
                      text: expansion.text,
                      forceMoveMarkers: true,
                    },
                  ]);
                  return;
                }
              }
            }
            editor.trigger('keyboard', 'type', { text: '\t' });
          });
          // Toggle breakpoint by clicking the line number
          editor.onMouseDown((e) => {
            if (
              e.target.type === m.editor.MouseTargetType.GUTTER_LINE_NUMBERS ||
              e.target.type === m.editor.MouseTargetType.GUTTER_GLYPH_MARGIN
            ) {
              const line = e.target.position?.lineNumber;
              if (line) useEditorStore.getState().toggleBreakpoint(tab.path, line);
            }
          });
          // Fix: Ensure Select All appears in editor context menu (was missing per screenshot)
          try {
            editor.addAction({
              id: 'velo.selectAll',
              label: 'Select All',
              keybindings: [m.KeyMod.CtrlCmd | m.KeyCode.KeyA],
              contextMenuGroupId: '9_cutcopypaste',
              contextMenuOrder: 4.5,
              run: (ed) => {
                const model = ed.getModel();
                if (model) ed.setSelection(model.getFullModelRange());
              },
            });
          } catch {}
          // Power features: deferred to idle to keep editor instant (critical for large files)
          const defer = (fn: () => void) => {
            const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
            if (idle) idle(fn, { timeout: 800 });
            else setTimeout(fn, 250);
          };
          defer(() => {
            try { setupErrorLens(editor); } catch (err) { console.error('ErrorLens init failed:', err); }
          });
          defer(() => {
            try { setupTodoHighlight(editor); } catch (err) { console.error('TODO highlight init failed:', err); }
          });
          defer(() => {
            try { setupAutoCloseTag(editor, () => tab.language === 'html'); } catch (err) { console.error('AutoCloseTag init failed:', err); }
          });
        }}
      />
      {inlineEdit && (
        <div className="inline-edit-widget" style={{ top: inlineEdit.top, left: inlineEdit.left }}>
          {!inlineEdit.applied ? (
            <>
              <Sparkles size={14} className="inline-edit-spark" />
              <input
                id="velo-inline-input"
                className="inline-edit-input"
                placeholder="Ask AI to edit… (Enter to apply, Esc to cancel) — Ctrl+A لتحديد الكل"
                value={prompt}
                disabled={busy}
                onChange={(e) => setPrompt(e.target.value)}
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
                    e.preventDefault();
                    (e.target as HTMLInputElement).select();
                    return;
                  }
                  if (e.key === 'Enter') runInlineEdit(prompt);
                  if (e.key === 'Escape') setInlineEdit(null);
                }}
              />
              {busy && <span className="spinner" />}
              <button className="inline-edit-close" onClick={() => setInlineEdit(null)}>
                <X size={13} />
              </button>
            </>
          ) : (
            <div className="inline-edit-review">
              <Sparkles size={14} className="inline-edit-spark" />
              <span>AI edit applied</span>
              <button className="btn-tiny accept" onClick={acceptEdit}>
                <Check size={12} /> Accept
              </button>
              <button className="btn-tiny reject" onClick={rejectEdit}>
                <RotateCcw size={12} /> Reject
              </button>
            </div>
          )}
        </div>
      )}
      <div className="editor-watermark">{tab.truncated ? 'Large file — truncated to 4MB' : ''}</div>
    </div>
  );
}

function PreviewView({ tab }: { tab: Tab }) {
  if (tab.preview === 'image') {
    return (
      <div className="preview-view">
        <img src={fileUrl(tab.path)} alt={tab.name} />
        <p>{tab.name}</p>
      </div>
    );
  }
  if (tab.preview === 'pdf') {
    return <iframe className="pdf-preview" src={fileUrl(tab.path)} title={tab.name} />;
  }
  return (
    <div className="welcome">
      <VeloLogo size={48} />
      <h2 className="welcome-title" style={{ fontSize: 20 }}>{tab.name}</h2>
      <p className="welcome-sub">Binary file — preview not available</p>
      <div className="welcome-actions">
        <button className="btn-primary" onClick={() => window.velo.openPath(tab.path)}>Open with default app</button>
      </div>
    </div>
  );
}

function HtmlPreviewView({ tab }: { tab: Tab }) {
  return (
    <div className="md-preview" dangerouslySetInnerHTML={{ __html: tab.content }} />
  );
}

function DiffView({ tab }: { tab: Tab }) {
  const info = tab.diffInfo!;
  return (
    <div className="diff-container">
      <div className="diff-title">{info.title}</div>
      <DiffEditor
        original={info.original}
        modified={info.modified}
        language={info.language}
        theme={useSettingsStore.getState().settings.theme}
        options={{
          readOnly: true,
          renderSideBySide: true,
          automaticLayout: true,
          fontSize: 13,
          fontFamily: "'JetBrains Mono', Consolas, monospace",
        }}
      />
    </div>
  );
}

function SplitPaneView({ tab }: { tab: Tab }) {
  const { fontSize, tabSize, wordWrap, stickyScroll, theme } = useSettingsStore((s) => s.settings);
  const modelContentRef = useRef(tab.content);
  return (
    <Editor
      language={tab.language}
      theme={theme}
      defaultValue={tab.content}
      path={tab.path}
      options={{
        fontSize,
        tabSize,
        wordWrap: wordWrap ? 'on' : 'off',
        fontFamily: "'JetBrains Mono', Consolas, monospace",
        automaticLayout: true,
        minimap: { enabled: false },
        stickyScroll: { enabled: stickyScroll },
      }}
      onMount={(editor) => {
        editor.onDidChangeModelContent(() => {
          const v = editor.getValue();
          if (v !== modelContentRef.current) {
            modelContentRef.current = v;
            useEditorStore.getState().updateContent(tab.id, v);
          }
        });
      }}
    />
  );
}

export function EditorArea() {
  const { tabs, activeTabId } = useEditorStore();
  const splitEditor = useUIStore((s) => s.splitEditor);
  const toggleSplitEditor = useUIStore((s) => s.toggleSplitEditor);
  const activeTab = tabs.find((t) => t.id === activeTabId) || null;

  useEffect(() => {
    const off = window.velo.onFsChanged(async (p) => {
      const store = useEditorStore.getState();
      if (store.tabs.some((t) => t.path === p && !t.dirty)) {
        await store.reloadTabFromDisk(p);
      }
    });
    return off;
  }, []);

  useEffect(() => {
    setAiLensHandler(({ kind, path, code }) => {
      const prompts = {
        explain: `Explain what this code does, step by step. Mention edge cases and potential bugs:\n\nFile: ${path}\n\`\`\`\n${code}\n\`\`\``,
        refactor: `Refactor this code for readability, performance and best practices. Show the improved version and briefly list the changes:\n\nFile: ${path}\n\`\`\`\n${code}\n\`\`\``,
        test: `Write thorough unit tests for this code. Use the most idiomatic testing framework for its language:\n\nFile: ${path}\n\`\`\`\n${code}\n\`\`\``,
      };
      void import('../../store/useAIStore').then((m) => m.useAIStore.getState().askAI(prompts[kind]));
    });
  }, []);

  const content = !activeTab ? (
    <Welcome />
  ) : activeTab.kind === 'preview' ? (
    <HtmlPreviewView tab={activeTab} />
  ) : activeTab.kind === 'diff' ? (
    <DiffView tab={activeTab} />
  ) : activeTab.binary ? (
    <PreviewView tab={activeTab} />
  ) : (
    <FileEditor key={activeTab.id} tab={activeTab} />
  );

  return (
    <div className="editor-area">
      <TabsBar />
      {activeTab?.kind === 'file' && !activeTab.binary && <Breadcrumbs />}
      <div className={`editor-body ${splitEditor ? 'split' : ''}`}>
        <div className="editor-pane" style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
          {content}
        </div>
        {splitEditor && (
          <div className="editor-pane split-pane">
            <div className="split-header">
              <FileIcon size={12} />
              <span>{activeTab?.name || '—'}</span>
              <button onClick={toggleSplitEditor} title="Close split">
                <X size={13} />
              </button>
            </div>
            {activeTab && activeTab.kind === 'file' && !activeTab.binary ? (
              <SplitPaneView tab={activeTab} />
            ) : (
              <div className="split-empty">Open a file to see it here</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
