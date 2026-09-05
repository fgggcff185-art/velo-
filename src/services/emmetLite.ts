/**
 * Lightweight Emmet-style abbreviation expander for HTML.
 * Supports: tag, .class, #id, [attr=value], {text}, > child, * N, + sibling.
 * Examples:
 *   div.container#main>ul.list>li.item*3  → nested structure
 *   a[href=google.com]{Click}+p{Hello}    → siblings
 */

interface ParsedNode {
  tag: string;
  classes: string[];
  id?: string;
  attrs: Record<string, string>;
  text?: string;
  repeat?: number;
  children: ParsedNode[];
}

function parseNode(src: string): ParsedNode {
  const node: ParsedNode = { tag: 'div', classes: [], attrs: {}, children: [] };
  const re = /([a-zA-Z][\w-]*)|\.([\w-]+)|#([\w-]+)|\[([^\]]*)\]|\{([^}]*)\}|\*(\d+)/g;
  let m: RegExpExecArray | null;
  let tagSet = false;
  while ((m = re.exec(src)) !== null) {
    if (m[1]) {
      if (!tagSet) {
        node.tag = m[1];
        tagSet = true;
      } else {
        node.classes.push(m[1]);
      }
    } else if (m[2]) node.classes.push(m[2]);
    else if (m[3]) node.id = m[3];
    else if (m[4]) {
      for (const pair of m[4].split(';')) {
        const eq = pair.indexOf('=');
        if (eq > 0) node.attrs[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim().replace(/^"|"$/g, '');
      }
    } else if (m[5]) node.text = m[5];
    else if (m[6]) node.repeat = Math.min(parseInt(m[6], 10) || 1, 100);
  }
  return node;
}

function splitTopLevel(src: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of src) {
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    if (ch === sep && depth === 0) {
      parts.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  parts.push(cur);
  return parts.filter((p) => p.length > 0);
}

function parseTree(src: string): ParsedNode[] {
  // split on top-level '>' and '+' preserving order: children chains and siblings
  const result: ParsedNode[] = [];
  let rest = src;
  while (rest.length) {
    const plusIdx = findTopLevel(rest, '+');
    const gtIdx = findTopLevel(rest, '>');
    if (plusIdx !== -1 && (gtIdx === -1 || plusIdx < gtIdx)) {
      result.push(...parseTree(rest.slice(0, plusIdx)));
      rest = rest.slice(plusIdx + 1);
    } else if (gtIdx !== -1) {
      const parentPart = rest.slice(0, gtIdx);
      rest = rest.slice(gtIdx + 1);
      const parents = parseTree(parentPart);
      const children = parseTree(rest);
      for (const p of parents) {
        p.children = children.map((c) => cloneNode(c));
        result.push(p);
      }
      return result;
    } else {
      result.push(parseNode(rest));
      return result;
    }
  }
  return result;
}

function findTopLevel(src: string, sep: string): number {
  let depth = 0;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    else if (ch === sep && depth === 0) return i;
  }
  return -1;
}

function cloneNode(n: ParsedNode): ParsedNode {
  return { ...n, classes: [...n.classes], attrs: { ...n.attrs }, children: n.children.map(cloneNode) };
}

function renderNode(node: ParsedNode, indent: number): string {
  const pad = '  '.repeat(indent);
  const attrs: string[] = [];
  if (node.id) attrs.push(`id="${node.id}"`);
  if (node.classes.length) attrs.push(`class="${node.classes.join(' ')}"`);
  for (const [k, v] of Object.entries(node.attrs)) attrs.push(`${k}="${v}"`);
  const attrStr = attrs.length ? ` ${attrs.join(' ')}` : '';
  const open = `<${node.tag}${attrStr}>`;
  const close = `</${node.tag}>`;

  if (node.children.length === 0) {
    if (node.text !== undefined) return `${pad}${open}${node.text}${close}`;
    return `${pad}${open}${close}`;
  }
  const inner = node.children.map((c) => renderNode(c, indent + 1)).join('\n');
  const textLine = node.text !== undefined ? `\n${'  '.repeat(indent + 1)}${node.text}` : '';
  return `${pad}${open}${textLine}\n${inner}\n${pad}${close}`;
}

export function expandAbbreviation(abbr: string): string | null {
  const src = abbr.trim();
  if (!src || !/^[a-zA-Z][\w.#\[\]=>+*{}\-:()"'\s]*$/.test(src)) return null;
  if (!/[.#>*+\[]/.test(src)) return null; // plain word — not an abbreviation
  try {
    const trees = parseTree(src);
    if (trees.length === 0) return null;
    const rendered = trees.map((n) => {
      if (n.repeat && n.repeat > 1) {
        return Array.from({ length: n.repeat }, (_, i) => {
          const clone = cloneNode(n);
          clone.repeat = undefined;
          const out = renderNode(clone, 0);
          return out.replace(/(\$\{i\}|\bitem\b)/g, `item${i + 1}`);
        }).join('\n');
      }
      n.repeat = undefined;
      return renderNode(n, 0);
    });
    return rendered.join('\n');
  } catch {
    return null;
  }
}

/** Try to expand the word before the cursor in an HTML file. Returns expanded text or null. */
export function tryExpandAtCursor(
  model: { getValueInRange: (r: unknown) => string; getWordUntilPosition: (p: unknown) => { word: string } | null },
  position: { lineNumber: number; column: number },
  RangeCtor: new (sl: number, sc: number, el: number, ec: number) => { startLineNumber: number; endLineNumber: number }
): { text: string; range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number } } | null {
  const line = model.getValueInRange({
    startLineNumber: position.lineNumber,
    startColumn: 1,
    endLineNumber: position.lineNumber,
    endColumn: position.column,
  });
  const m = line.match(/([A-Za-z][\w.#\[\]=>+*{}\-:"'()\s]*)$/);
  if (!m) return null;
  const abbr = m[1];
  const expanded = expandAbbreviation(abbr);
  if (!expanded) return null;
  return {
    text: expanded,
    range: {
      startLineNumber: position.lineNumber,
      startColumn: position.column - abbr.length,
      endLineNumber: position.lineNumber,
      endColumn: position.column,
    },
  };
}
