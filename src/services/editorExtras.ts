import * as monaco from 'monaco-editor';
import { useSettingsStore } from '../store/useSettingsStore';

/**
 * Editor power-features inspired by the most-loved VS Code extensions:
 * - Error Lens      → inline error/warning text at the end of the line
 * - TODO Highlight  → highlight TODO / FIXME / HACK / NOTE comments
 * - Auto Close Tag  → auto-close HTML/XML tags when typing ">"
 * - Path Intellisense → complete workspace file paths inside strings
 */

// ===== Error Lens =====
const errorLensCollections = new WeakMap<monaco.editor.IStandaloneCodeEditor, monaco.editor.IEditorDecorationsCollection>();

export function setupErrorLens(editor: monaco.editor.IStandaloneCodeEditor): void {
  const update = () => {
    const settings = useSettingsStore.getState().settings;
    const model = editor.getModel();
    if (!model) return;
    let collection = errorLensCollections.get(editor);
    if (!collection) {
      collection = editor.createDecorationsCollection([]);
      errorLensCollections.set(editor, collection);
    }
    if (!settings.errorLens) {
      collection.clear();
      return;
    }
    const markers = monaco.editor
      .getModelMarkers({ resource: model.uri })
      .filter((m) => m.severity === 8 || m.severity === 4)
      .slice(0, 60);
    const decorations: monaco.editor.IModelDeltaDecoration[] = markers.map((m) => ({
      range: new monaco.Range(m.startLineNumber, model.getLineMaxColumn(m.startLineNumber), m.startLineNumber, model.getLineMaxColumn(m.startLineNumber)),
      options: {
        after: {
          content: `   ${m.severity === 8 ? '✖' : '⚠'} ${m.message.slice(0, 160)}`,
          inlineClassName: m.severity === 8 ? 'error-lens-error' : 'error-lens-warning',
        },
        stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
      },
    }));
    collection.set(decorations);
  };
  update();
  editor.onDidChangeModelDecorations(update);
  editor.onDidChangeModel(() => setTimeout(update, 100));
}

// ===== TODO Highlight =====
const TODO_RE = /\b(TODO|FIXME|HACK|XXX|NOTE|BUG|IMPORTANT)\b/;
const todoCollections = new WeakMap<monaco.editor.IStandaloneCodeEditor, monaco.editor.IEditorDecorationsCollection>();

export function setupTodoHighlight(editor: monaco.editor.IStandaloneCodeEditor): void {
  const update = () => {
    const model = editor.getModel();
    if (!model) return;
    let collection = todoCollections.get(editor);
    if (!collection) {
      collection = editor.createDecorationsCollection([]);
      todoCollections.set(editor, collection);
    }
    const lines = model.getLinesContent();
    const decorations: monaco.editor.IModelDeltaDecoration[] = [];
    for (let i = 0; i < Math.min(lines.length, 3000); i++) {
      const m = lines[i].match(TODO_RE);
      if (m) {
        const word = m[1];
        const col = lines[i].indexOf(word) + 1;
        decorations.push({
          range: new monaco.Range(i + 1, col, i + 1, col + word.length),
          options: {
            inlineClassName: `todo-highlight todo-${word}`,
            overviewRuler: {
              color: word === 'FIXME' || word === 'BUG' ? '#f76e6e' : word === 'TODO' ? '#f5d76e' : '#6ea8f7',
              position: monaco.editor.OverviewRulerLane.Right,
            },
          },
        });
      }
    }
    collection.set(decorations);
  };
  update();
  editor.onDidChangeModelContent(() => setTimeout(update, 300));
  editor.onDidChangeModel(() => setTimeout(update, 100));
}

// ===== Auto Close Tag =====
export function setupAutoCloseTag(editor: monaco.editor.IStandaloneCodeEditor, isHtmlLike: () => boolean): void {
  editor.onKeyDown((e) => {
    const key = e.browserEvent.key;
    if (key !== '>' || e.ctrlKey || e.altKey || e.metaKey) return;
    if (!isHtmlLike()) return;
    const model = editor.getModel();
    const pos = editor.getPosition();
    if (!model || !pos) return;
    const line = model.getValueInRange({
      startLineNumber: pos.lineNumber,
      startColumn: 1,
      endLineNumber: pos.lineNumber,
      endColumn: pos.column,
    });
    // an open tag is being completed: <div class="x" then user types ">"
    const m = line.match(/<([a-zA-Z][\w-]*)(?:\s[^<>]*)?$/);
    if (!m) return;
    const tag = m[1];
    if (/^(img|br|hr|input|meta|link|area|base|col|embed|source|track|wbr|!doctype)$/i.test(tag)) return;
    setTimeout(() => {
      const p = editor.getPosition();
      if (!p) return;
      editor.executeEdits('velo-auto-close', [
        {
          range: new monaco.Range(p.lineNumber, p.column, p.lineNumber, p.column),
          text: `</${tag}>`,
          forceMoveMarkers: false,
        },
      ]);
      editor.setPosition(p);
    }, 0);
  });
}

// ===== Auto Rename Tag (paired tag rename) =====
export function renameTagAtPosition(
  model: monaco.editor.ITextModel,
  position: monaco.Position,
  newName: string
): boolean {
  const line = model.getValueInRange({
    startLineNumber: position.lineNumber,
    startColumn: 1,
    endLineNumber: position.lineNumber,
    endColumn: model.getLineMaxColumn(position.lineNumber),
  });
  const before = line.slice(0, position.column - 1);
  // opening tag
  let m = before.match(/<([a-zA-Z][\w-]*)(?:\s[^<>]*)?$/);
  let isClosing = false;
  if (!m) {
    m = before.match(/<\/([a-zA-Z][\w-]*)$/);
    isClosing = true;
  }
  if (!m) return false;
  const oldTag = m[1];
  const tagCol = position.column - m[1].length - (isClosing ? 2 : 1);
  // rename in the current tag
  model.applyEdits([
    {
      range: new monaco.Range(position.lineNumber, tagCol, position.lineNumber, tagCol + oldTag.length),
      text: newName,
    },
  ]);
  // find and rename the matching pair on the same line
  const pairRe = isClosing
    ? new RegExp(`<${oldTag}(\\s|>|/)`, 'g')
    : new RegExp(`</${oldTag}>`, 'g');
  const fullLine = model.getLineContent(position.lineNumber);
  const pm = pairRe.exec(fullLine);
  if (pm) {
    const idx = pm.index + (isClosing ? 1 : 2);
    model.applyEdits([
      {
        range: new monaco.Range(position.lineNumber, idx + 1, position.lineNumber, idx + 1 + oldTag.length),
        text: newName,
      },
    ]);
  }
  return true;
}

// ===== Path Intellisense =====
let cachedFiles: string[] | null = null;
let cacheTime = 0;

async function workspaceFiles(): Promise<string[]> {
  if (cachedFiles && Date.now() - cacheTime < 30000) return cachedFiles;
  const { useFileStore } = await import('../store/useFileStore');
  const roots = useFileStore.getState().roots;
  const all: string[] = [];
  for (const root of roots) {
    try {
      all.push(...(await window.velo.listAllFiles(root)));
    } catch {
      /* skip */
    }
  }
  cachedFiles = all;
  cacheTime = Date.now();
  return all;
}

export function registerPathIntellisense(monacoMod: typeof monaco): void {
  monacoMod.languages.registerCompletionItemProvider(
    ['javascript', 'typescript', 'html', 'css', 'jsx', 'vue'],
    {
      triggerCharacters: ['/', '"', "'"],
      async provideCompletionItems(model, position) {
        const line = model.getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });
        const m = line.match(/["']([^"']*[\/\\])[^"']*$/);
        if (!m) return { suggestions: [] };
        const typed = m[1];
        const files = await workspaceFiles();
        const { useFileStore } = await import('../store/useFileStore');
        const root = useFileStore.getState().root || '';
        // replace the whole typed path segment
        const startCol = position.column - typed.length;
        const safeRange = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: Math.max(1, startCol),
          endColumn: position.column,
        };
        const suggestions = files
          .filter((f) => {
            const rel = f.startsWith(root) ? f.slice(root.length + 1).replace(/\\/g, '/') : f;
            return rel.toLowerCase().includes(typed.replace(/\\/g, '/').toLowerCase());
          })
          .slice(0, 50)
          .map((f) => {
            const rel = f.startsWith(root) ? f.slice(root.length + 1).replace(/\\/g, '/') : f;
            return {
              label: rel,
              kind: monacoMod.languages.CompletionItemKind.File,
              insertText: rel,
              detail: 'path',
              sortText: `1${rel}`,
              range: safeRange,
            };
          });
        return { suggestions };
      },
    }
  );
}
