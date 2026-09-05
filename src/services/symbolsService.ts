import type * as monacoTypes from 'monaco-editor';

export interface SymbolInfo {
  name: string;
  kind: 'function' | 'class' | 'variable' | 'interface' | 'type' | 'section' | 'method';
  line: number;
}

type Monaco = typeof monacoTypes;

const SYMBOL_PATTERNS: Array<{ re: RegExp; kind: SymbolInfo['kind'] }> = [
  { re: /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s+([A-Za-z_$][\w$]*)/, kind: 'function' },
  { re: /^\s*(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/, kind: 'class' },
  { re: /^\s*(?:export\s+)?(?:interface|trait)\s+([A-Za-z_$][\w$]*)/, kind: 'interface' },
  { re: /^\s*(?:export\s+)?type\s+([A-Za-z_$][\w$]*)/, kind: 'type' },
  { re: /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/, kind: 'function' },
  { re: /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/, kind: 'variable' },
  { re: /^\s*(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z_][\w]*)/, kind: 'function' },
  { re: /^\s*(?:pub\s+)?struct\s+([A-Za-z_][\w]*)/, kind: 'class' },
  { re: /^\s*def\s+([A-Za-z_][\w]*)/, kind: 'function' },
  { re: /^\s*class\s+([A-Za-z_][\w]*)/, kind: 'class' },
  { re: /^\s*(?:public|private|protected|internal|static|final|abstract|override|\s)*\s*[\w<>\[\]]+\s+([A-Za-z_][\w]*)\s*\([^;)]*\)\s*\{/, kind: 'method' },
  { re: /^\s*(\w+)\s*:\s*(?:React\.FC|function)\b/, kind: 'function' },
];

export function getDocumentSymbols(model: { getLinesContent: () => string[] }): SymbolInfo[] {
  const lines = model.getLinesContent();
  const symbols: SymbolInfo[] = [];
  for (let i = 0; i < lines.length && symbols.length < 500; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const md = line.match(/^(#{1,6})\s+(.+)/);
    if (md) {
      symbols.push({ name: md[2].trim(), kind: 'section', line: i + 1 });
      continue;
    }
    for (const { re, kind } of SYMBOL_PATTERNS) {
      const m = line.match(re);
      if (m && m[1] && !['if', 'for', 'while', 'switch', 'catch', 'return', 'else'].includes(m[1])) {
        symbols.push({ name: m[1], kind, line: i + 1 });
        break;
      }
    }
  }
  return symbols;
}

export function registerSymbolProviders(monaco: Monaco): void {
  monaco.languages.registerDocumentSymbolProvider('*', {
    provideDocumentSymbols(model) {
      return getDocumentSymbols(model).map((s) => ({
        name: s.name,
        detail: '',
        kind: symbolKind(monaco, s.kind),
        tags: [],
        range: {
          startLineNumber: s.line,
          startColumn: 1,
          endLineNumber: s.line,
          endColumn: 1,
        },
        selectionRange: {
          startLineNumber: s.line,
          startColumn: 1,
          endLineNumber: s.line,
          endColumn: 1,
        },
        children: [],
      }));
    },
  });
}

function symbolKind(monaco: Monaco, kind: SymbolInfo['kind']): number {
  const K = monaco.languages.SymbolKind;
  switch (kind) {
    case 'function':
    case 'method':
      return K.Function;
    case 'class':
      return K.Class;
    case 'interface':
      return K.Interface;
    case 'type':
      return K.Struct;
    case 'section':
      return K.String;
    default:
      return K.Variable;
  }
}

const DECL_RE = (ident: string): string =>
  `(?:function|def|fn|class|struct|interface|type|const|let|var|enum|trait|impl|module|sub|proc)\\s+${ident}\\b|${ident}\\s*[:=]\\s*(?:function|\\([^)]*\\)\\s*=>|async)`;

export interface DefinitionResult {
  path: string;
  line: number;
}

export async function findDefinition(
  roots: string[],
  ident: string
): Promise<DefinitionResult | null> {
  for (const root of roots) {
    const res = await window.velo.search(root, DECL_RE(ident), { regex: true, caseSensitive: true });
    if (res.results && res.results.length > 0) {
      return { path: res.results[0].path, line: res.results[0].line };
    }
  }
  return null;
}
