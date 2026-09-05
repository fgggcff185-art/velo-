import * as monaco from 'monaco-editor';

/**
 * Converts VS Code / Open VSX color themes (workbench + tokenColors)
 * into Velo themes: a Monaco theme + CSS variable overrides.
 */

interface VsTheme {
  name?: string;
  type?: 'dark' | 'light';
  colors?: Record<string, string>;
  tokenColors?: Array<{ scope?: string | string[]; settings: { foreground?: string; fontStyle?: string } }>;
}

const WORKBENCH_MAP: Record<string, string> = {
  'editor.background': '--bg-1',
  'editor.foreground': '--text-0',
  'sideBar.background': '--bg-0',
  'activityBar.background': '--bg-0',
  'statusBar.background': '--bg-2',
  'titleBar.activeBackground': '--bg-1',
  'editorGroupHeader.tabsBackground': '--bg-2',
  'tab.inactiveBackground': '--bg-2',
  'tab.activeBackground': '--bg-1',
  'panel.background': '--bg-1',
  'input.background': '--bg-3',
  'dropdown.background': '--bg-3',
  'editorWidget.background': '--bg-3',
  'editor.lineHighlightBackground': '--bg-3',
  'editorLineNumber.foreground': '--text-3',
  'focusBorder': '--accent-2',
  'button.background': '--accent-2',
};

const TOKEN_MAP: Array<{ match: string[]; token: string }> = [
  { match: ['comment'], token: 'comment' },
  { match: ['keyword', 'keyword.control', 'storage', 'storage.type', 'keyword.operator'], token: 'keyword' },
  { match: ['string', 'string.quoted'], token: 'string' },
  { match: ['constant.numeric', 'numeric'], token: 'number' },
  { match: ['entity.name.type', 'support.type', 'entity.name.class'], token: 'type' },
  { match: ['entity.name.function', 'support.function', 'meta.function-call'], token: 'function' },
  { match: ['variable', 'variable.other'], token: 'variable' },
];

function normalizeHex(color: string | undefined): string | undefined {
  if (!color) return undefined;
  let c = color.trim();
  if (/^[0-9a-fA-F]{6}$/.test(c)) return `#${c}`;
  if (/^#[0-9a-fA-F]{6}$/.test(c)) return c;
  if (/^#[0-9a-fA-F]{8}$/.test(c)) return c.slice(0, 7);
  if (/^#[0-9a-fA-F]{3}$/.test(c)) return c;
  return undefined;
}

export interface ConvertedTheme {
  id: string;
  label: string;
  base: 'vs-dark' | 'vs';
  rules: monaco.editor.ITokenThemeRule[];
  colors: Record<string, string>;
  cssVars: Record<string, string>;
}

export function convertVsTheme(id: string, label: string, json: VsTheme): ConvertedTheme {
  const isLight = json.type === 'light';
  const colors: Record<string, string> = {
    'editor.background': normalizeHex(json.colors?.['editor.background']) || (isLight ? '#f7f8fb' : '#0d1117'),
    'editor.foreground': normalizeHex(json.colors?.['editor.foreground']) || (isLight ? '#1f2430' : '#e2e8f0'),
    'editor.lineHighlightBackground':
      normalizeHex(json.colors?.['editor.lineHighlightBackground']) || (isLight ? '#eef1f6' : '#161c26'),
    'editorCursor.foreground': normalizeHex(json.colors?.['editorCursor.foreground']) || (isLight ? '#7c3aed' : '#38e1ff'),
    'editorLineNumber.foreground':
      normalizeHex(json.colors?.['editorLineNumber.foreground']) || (isLight ? '#8a93a5' : '#3d4657'),
    'minimap.background': normalizeHex(json.colors?.['editor.background']) || (isLight ? '#f7f8fb' : '#0d1117'),
  };

  const cssVars: Record<string, string> = {
    '--bg-0': normalizeHex(json.colors?.['sideBar.background']) || (isLight ? '#eef1f6' : '#0b0e14'),
    '--bg-1': colors['editor.background'],
    '--bg-2': normalizeHex(json.colors?.['editorGroupHeader.tabsBackground']) || (isLight ? '#ffffff' : '#11161f'),
    '--bg-3': normalizeHex(json.colors?.['editorWidget.background']) || (isLight ? '#f0f2f7' : '#161c26'),
    '--bg-4': normalizeHex(json.colors?.['editorWidget.background']) || (isLight ? '#e4e8f0' : '#1c2330'),
    '--bg-hover': isLight ? '#e8ecf3' : '#1e2532',
    '--border': normalizeHex(json.colors?.['panel.border']) || (isLight ? '#d5dbe6' : '#232b3b'),
    '--border-light': normalizeHex(json.colors?.['panel.border']) || (isLight ? '#c3cbda' : '#2d3648'),
    '--text-0': colors['editor.foreground'],
    '--text-1': isLight ? '#38415a' : '#b7c1d4',
    '--text-2': isLight ? '#5c6880' : '#7c8aa0',
    '--text-3': colors['editorLineNumber.foreground'],
  };

  const rules: monaco.editor.ITokenThemeRule[] = [];
  for (const tc of json.tokenColors || []) {
    const fg = normalizeHex(tc.settings?.foreground);
    if (!fg) continue;
    const scopes = Array.isArray(tc.scope) ? tc.scope : tc.scope ? [tc.scope] : [];
    const fontStyle = tc.settings?.fontStyle || undefined;
    for (const { match, token } of TOKEN_MAP) {
      if (scopes.some((s) => match.some((m) => s === m || s.startsWith(m)))) {
        rules.push({ token, foreground: fg.slice(1), fontStyle: fontStyle || undefined });
        break;
      }
    }
    if (scopes.length === 0) {
      // default foreground
    }
  }

  return { id, label, base: isLight ? 'vs' : 'vs-dark', rules, colors, cssVars };
}

export function registerConvertedTheme(theme: ConvertedTheme): void {
  monaco.editor.defineTheme(theme.id, {
    base: theme.base,
    inherit: true,
    rules: theme.rules,
    colors: theme.colors,
  });
}

export function applyCssVars(theme: ConvertedTheme | null): void {
  let styleEl = document.getElementById('velo-ext-theme-vars') as HTMLStyleElement | null;
  if (!theme) {
    styleEl?.remove();
    return;
  }
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'velo-ext-theme-vars';
    document.head.appendChild(styleEl);
  }
  const css = Object.entries(theme.cssVars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
  styleEl.textContent = `:root {\n${css}\n}`;
}

/** Resolve a settings.theme value like "ext:<extensionId>:<index>" into a converted theme. */
export async function resolveExtTheme(themeSetting: string): Promise<ConvertedTheme | null> {
  if (!themeSetting.startsWith('ext:')) return null;
  const [, id, idxStr] = themeSetting.split(':');
  const idx = Number(idxStr) || 0;
  try {
    const installed = await window.velo.extInstalled();
    const ext = (installed.extensions || []).find((e) => e.id === id);
    if (!ext || !ext.themes || !ext.themes[idx]) return null;
    const meta = ext.themes[idx];
    const raw = await window.velo.extReadFile(meta.path);
    if (typeof raw !== 'string') return null;
    const json = JSON.parse(raw) as VsTheme;
    const converted = convertVsTheme(`ext-${id}-${idx}`, meta.label || ext.displayName, json);
    registerConvertedTheme(converted);
    return converted;
  } catch {
    return null;
  }
}

export async function listInstalledThemes(): Promise<Array<{ value: string; label: string }>> {
  try {
    const installed = await window.velo.extInstalled();
    const out: Array<{ value: string; label: string }> = [];
    for (const ext of installed.extensions || []) {
      (ext.themes || []).forEach((t, i) => {
        out.push({ value: `ext:${ext.id}:${i}`, label: `${t.label || ext.displayName} (extension)` });
      });
    }
    return out;
  } catch {
    return [];
  }
}
