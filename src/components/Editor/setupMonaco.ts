import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker&inline';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker&inline';
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker&inline';
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker&inline';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker&inline';
import { loader } from '@monaco-editor/react';
import { aiComplete } from '../../services/aiService';
import { useSettingsStore } from '../../store/useSettingsStore';
import { snippetsFor, snippetLanguages } from '../../services/snippetsService';
import { getBoilerplatesForLang, allBoilerplateLanguages, getEmmetSnippet, emmetKeys } from '../../services/boilerplateService';
import { registerSymbolProviders } from '../../services/symbolsService';
import { registerPathIntellisense } from '../../services/editorExtras';

self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === 'json') return new JsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new CssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker();
    if (label === 'typescript' || label === 'javascript') return new TsWorker();
    return new EditorWorker();
  },
};

loader.config({ monaco });

// ===== Themes =====
const THEME_BASES: Record<string, 'vs-dark' | 'vs'> = {
  'velo-dark': 'vs-dark',
  'velo-ocean': 'vs-dark',
  'velo-rose': 'vs-dark',
  'velo-light': 'vs',
};

const THEME_COLORS: Record<string, Record<string, string>> = {
  'velo-dark': {
    'editor.background': '#0d1117',
    'editor.foreground': '#e2e8f0',
    'editor.lineHighlightBackground': '#161c26',
    'editorCursor.foreground': '#38e1ff',
    'minimap.background': '#0d1117',
  },
  'velo-ocean': {
    'editor.background': '#0b1622',
    'editor.foreground': '#d5e5f5',
    'editor.lineHighlightBackground': '#12202f',
    'editorCursor.foreground': '#5ce8d5',
    'minimap.background': '#0b1622',
  },
  'velo-rose': {
    'editor.background': '#170f18',
    'editor.foreground': '#f0dfee',
    'editor.lineHighlightBackground': '#1f1522',
    'editorCursor.foreground': '#e14eff',
    'minimap.background': '#170f18',
  },
  'velo-light': {
    'editor.background': '#f7f8fb',
    'editor.foreground': '#1f2430',
    'editor.lineHighlightBackground': '#eef1f6',
    'editorCursor.foreground': '#8b5cf6',
    'minimap.background': '#f7f8fb',
  },
};

const THEME_RULES: Record<string, monaco.editor.ITokenThemeRule[]> = {
  'velo-dark': [
    { token: 'comment', foreground: '5b657d', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'c792ea' },
    { token: 'string', foreground: 'a5e88a' },
    { token: 'number', foreground: 'f78c6c' },
    { token: 'type', foreground: '7fdbff' },
    { token: 'function', foreground: '82aaff' },
  ],
  'velo-ocean': [
    { token: 'comment', foreground: '4a6a80', fontStyle: 'italic' },
    { token: 'keyword', foreground: '5ce8d5' },
    { token: 'string', foreground: 'a5e88a' },
    { token: 'number', foreground: 'f5d76e' },
    { token: 'type', foreground: '6ea8f7' },
    { token: 'function', foreground: '82ddff' },
  ],
  'velo-rose': [
    { token: 'comment', foreground: '7a5f78', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'e14eff' },
    { token: 'string', foreground: 'f5a3c0' },
    { token: 'number', foreground: 'f5d76e' },
    { token: 'type', foreground: 'c792ea' },
    { token: 'function', foreground: 'ff8ad8' },
  ],
  'velo-light': [
    { token: 'comment', foreground: '8a93a5', fontStyle: 'italic' },
    { token: 'keyword', foreground: '7c3aed' },
    { token: 'string', foreground: '0e7a3d' },
    { token: 'number', foreground: 'b45309' },
    { token: 'type', foreground: '0369a1' },
    { token: 'function', foreground: '1d4ed8' },
  ],
};

export const THEMES = Object.keys(THEME_COLORS);

export function applyMonacoTheme(theme: string): void {
  const name = THEMES.includes(theme) ? theme : 'velo-dark';
  monaco.editor.defineTheme(name, {
    base: THEME_BASES[name],
    inherit: true,
    rules: THEME_RULES[name],
    colors: THEME_COLORS[name],
  });
  monaco.editor.setTheme(name);
}

for (const t of THEMES) {
  monaco.editor.defineTheme(t, {
    base: THEME_BASES[t],
    inherit: true,
    rules: THEME_RULES[t],
    colors: THEME_COLORS[t],
  });
}

// ===== Active editor reference (for commands like Go to Definition) =====
let activeEditor: monaco.editor.IStandaloneCodeEditor | null = null;
export function getActiveEditor(): monaco.editor.IStandaloneCodeEditor | null {
  return activeEditor;
}
export function setActiveEditor(ed: monaco.editor.IStandaloneCodeEditor | null): void {
  activeEditor = ed;
}

// ===== Ghost text =====
let ghostTextRegistered = false;

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function registerGhostText(): void {
  if (ghostTextRegistered) return;
  ghostTextRegistered = true;

  let lastRequestTime = 0;
  monaco.languages.registerInlineCompletionsProvider(
    { pattern: '**' },
    {
      async provideInlineCompletions(model, position, _context, token) {
        const settings = useSettingsStore.getState().settings;
        if (!settings.ghostText) return { items: [] };
        // Performance: disable for large files (>80KB) - faster editor
        if (model.getValueLength() > 80 * 1024) return { items: [] };
        const cfg = settings.providers[settings.defaultProvider];
        if (settings.defaultProvider !== 'ollama' && !cfg?.apiKey) return { items: [] };

        // Throttle: at most 1 request per 900ms to keep editor snappy
        const now = Date.now();
        if (now - lastRequestTime < 900) return { items: [] };

        await delay(850);
        if (token.isCancellationRequested) return { items: [] };
        lastRequestTime = Date.now();

        const offset = model.getOffsetAt(position);
        const value = model.getValue();
        const prefix = value.slice(Math.max(0, offset - 3500), offset);
        const suffix = value.slice(offset, offset + 1200);
        if (!prefix.trim() || prefix.trim().length < 10) return { items: [] };

        const text = await aiComplete({ prefix, suffix });
        if (!text || token.isCancellationRequested) return { items: [] };

        const cleaned = text
          .replace(/^```[\w]*\n?/, '')
          .replace(/\n?```$/, '')
          .replace(/^\n+/, '');

        if (!cleaned) return { items: [] };
        return {
          items: [
            {
              insertText: cleaned,
              range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
            },
          ],
        };
      },
      handleItemDidShow: () => undefined,
      freeInlineCompletions: () => undefined,
    }
  );
}

// ===== AI Code Lens (Explain / Refactor / Test above functions) =====
export interface AiLensArgs {
  kind: 'explain' | 'refactor' | 'test';
  path: string;
  code: string;
}

let aiLensHandler: ((args: AiLensArgs) => void) | null = null;
export function setAiLensHandler(fn: (args: AiLensArgs) => void): void {
  aiLensHandler = fn;
}

const FUNC_LINE_RE =
  /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(function\s+\*?\s*[A-Za-z_$][\w$]*|(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*(?:async\s*)?\()|^\s*def\s+[A-Za-z_]\w*\s*\(|^\s*(?:pub\s+)?fn\s+\w+|^\s*class\s+[A-Za-z_$][\w$]*|^\s*(?:func|sub)\s+\w+/;

let codelensRegistered = false;
export function registerAiCodeLens(): void {
  if (codelensRegistered) return;
  codelensRegistered = true;

  monaco.languages.registerCodeLensProvider({ pattern: '**' }, {
    provideCodeLenses(model) {
      if (model.getValueLength() > 120 * 1024) return { lenses: [], dispose: () => undefined };
      const settings = useSettingsStore.getState().settings;
      const cfg = settings.providers[settings.defaultProvider];
      if (settings.defaultProvider !== 'ollama' && !cfg?.apiKey) return { lenses: [], dispose: () => undefined };
      const lenses: monaco.languages.CodeLens[] = [];
      const lines = model.getLinesContent();
      for (let i = 0; i < Math.min(lines.length, 250); i++) {
        if (lenses.length >= 6) break;
        if (!FUNC_LINE_RE.test(lines[i])) continue;
        // capture the block (up to 40 lines until brace balance / dedent)
        let end = i;
        let depth = 0;
        let started = false;
        for (let j = i; j < Math.min(lines.length, i + 60); j++) {
          for (const ch of lines[j]) {
            if ('{(:'.includes(ch)) depth++;
            else if ('})'.includes(ch)) depth = Math.max(0, depth - 1);
          }
          if (depth > 0 || j === i) started = true;
          end = j;
          if (started && depth === 0 && j > i) break;
          if (j > i && /^\S/.test(lines[j]) && lines[j].trim() && depth === 0) {
            end = j - 1;
            break;
          }
        }
        const range = { startLineNumber: i + 1, startColumn: 1, endLineNumber: i + 1, endColumn: 1 };
        const code = lines.slice(i, end + 1).join('\n').slice(0, 6000);
        const path = (model as { uri?: monaco.Uri }).uri?.fsPath || 'untitled';
        for (const kind of ['explain', 'refactor', 'test'] as const) {
          lenses.push({
            range,
            command: {
              id: 'velo.ai.lens',
              title: kind === 'explain' ? 'âœ¨ Explain' : kind === 'refactor' ? 'âœ¨ Refactor' : 'âœ¨ Test',
              arguments: [{ kind, path, code } as AiLensArgs],
            },
          });
        }
      }
      return { lenses, dispose: () => undefined };
    },
  });

  monaco.editor.registerCommand('velo.ai.lens', (_accessor, args: AiLensArgs) => {
    aiLensHandler?.(args);
  });
}

// ===== Universal Boilerplate Engine 4.0 — ! trigger for ALL languages =====
let boilerplateRegistered = false;
export function registerBoilerplates(): void {
  if (boilerplateRegistered) return;
  boilerplateRegistered = true;
  for (const lang of allBoilerplateLanguages()) {
    monaco.languages.registerCompletionItemProvider(lang, {
      triggerCharacters: ['!', '.', ':', '>'],
      provideCompletionItems(model, position) {
        const lineContent = model.getLineContent(position.lineNumber);
        const beforeCursor = lineContent.slice(0, position.column - 1);
        const word = model.getWordUntilPosition(position);
        const textBefore = beforeCursor.trim();

        // Detect ! trigger: line is exactly "!" or ends with "!" or word is "!"
        const isBang = textBefore === '!' || textBefore.endsWith('!') || word.word === '!' || beforeCursor.endsWith('!');
        // Detect other triggers like main, rfc etc. at line start
        const suggestions: monaco.languages.CompletionItem[] = [];
        const boilerplates = getBoilerplatesForLang(lang);

        for (const bp of boilerplates) {
          const shouldShow = isBang ? bp.triggers.includes('!') : bp.triggers.some((t) => word.word === t || textBefore.endsWith(t));
          if (!shouldShow && !isBang) {
            // Also show boilerplate when word matches any trigger (for Tab completion)
            if (!bp.triggers.includes(word.word)) continue;
          }
          if (isBang && !bp.triggers.includes('!')) continue;

          // Range: if ! trigger, replace the "!" character
          let range: monaco.IRange;
          if (isBang) {
            const bangIdx = beforeCursor.lastIndexOf('!');
            const startCol = bangIdx >= 0 ? bangIdx + 1 : word.startColumn;
            range = {
              startLineNumber: position.lineNumber,
              startColumn: startCol,
              endLineNumber: position.lineNumber,
              endColumn: position.column,
            };
          } else {
            range = {
              startLineNumber: position.lineNumber,
              startColumn: word.startColumn,
              endLineNumber: position.lineNumber,
              endColumn: word.endColumn,
            };
          }

          for (const trig of bp.triggers) {
            suggestions.push({
              label: trig === '!' ? bp.label : `${trig} — ${bp.desc}`,
              kind: monaco.languages.CompletionItemKind.Snippet,
              detail: bp.desc,
              documentation: { value: '```' + lang + '\n' + bp.body.slice(0, 800) + '\n```' },
              insertText: bp.body,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              sortText: trig === '!' ? '000!' : `001${trig}`,
              range,
              command: { id: 'editor.action.triggerSuggest', title: 'Trigger Suggest' },
            });
          }
        }

        // Emmet for html/css
        if (lang === 'html' || lang === 'css' || lang === 'scss') {
          for (const key of emmetKeys()) {
            if (beforeCursor.includes(key) || word.word === key) {
              const em = getEmmetSnippet(key)!;
              suggestions.push({
                label: key,
                kind: monaco.languages.CompletionItemKind.Snippet,
                detail: em.desc,
                insertText: em.body,
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                sortText: `002${key}`,
                range: {
                  startLineNumber: position.lineNumber,
                  startColumn: word.startColumn,
                  endLineNumber: position.lineNumber,
                  endColumn: word.endColumn,
                },
              });
            }
          }
        }

        return { suggestions };
      },
    });
  }
}

// ===== Snippets =====
let snippetsRegistered = false;
export function registerSnippets(): void {
  if (snippetsRegistered) return;
  snippetsRegistered = true;
  for (const lang of snippetLanguages()) {
    monaco.languages.registerCompletionItemProvider(lang, {
      provideCompletionItems(model, position) {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };
        const suggestions = snippetsFor(lang).map((s) => ({
          label: s.prefix,
          kind: monaco.languages.CompletionItemKind.Snippet,
          detail: s.desc || 'snippet',
          documentation: s.body,
          insertText: s.body,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          sortText: `0${s.prefix}`,
          range,
        }));
        return { suggestions };
      },
    });
  }
}

registerSymbolProviders(monaco);
registerPathIntellisense(monaco);

export { monaco };
