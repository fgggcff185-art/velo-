import type { AgentStep } from '../types';
import { useFileStore } from '../store/useFileStore';
import { useEditorStore, activeFileTab } from '../store/useEditorStore';

export interface ToolCall {
  tool: string;
  input: Record<string, unknown>;
}

/**
 * Repairs near-JSON emitted by LLMs: escapes raw newlines/tabs inside strings,
 * removes trailing commas. This is the #1 reason tool calls fail to execute
 * (models write file content with literal newlines inside JSON strings).
 * v2: also handles unescaped quotes inside "content" values by escaping them
 * when they are not the closing quote.
 */
export function repairJson(input: string): string {
  let out = '';
  let inString = false;
  let escape = false;
  for (const ch of input) {
    if (escape) {
      out += ch;
      escape = false;
      continue;
    }
    if (ch === '\\' && inString) {
      out += ch;
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      out += ch;
      continue;
    }
    if (inString) {
      if (ch === '\n') {
        out += '\\n';
        continue;
      }
      if (ch === '\r') {
        out += '\\r';
        continue;
      }
      if (ch === '\t') {
        out += '\\t';
        continue;
      }
      const code = ch.charCodeAt(0);
      if (code < 32) {
        out += `\\u${code.toString(16).padStart(4, '0')}`;
        continue;
      }
    }
    out += ch;
  }
  // Also escape unescaped quotes inside content strings (heuristic):
  // Find "content": " ... " where inner quotes are not escaped and not closing
  // We do a second pass only for write_file content fields
  try {
    // If JSON is already valid, return as is (after trailing comma fix)
    JSON.parse(out);
    return out.replace(/,\s*([}\]])/g, '$1');
  } catch {
    // Try to fix content field specifically: locate "content" value and escape inner quotes
    const contentKeyRegex = /"content"\s*:\s*"/g;
    let match: RegExpExecArray | null;
    let fixed = out;
    let offset = 0;
    while ((match = contentKeyRegex.exec(out)) !== null) {
      const start = match.index + match[0].length;
      // Find the closing quote for this content value (last unescaped " before } )
      let end = -1;
      let depth = 0;
      let inStr = true; // we are inside content string
      let esc = false;
      for (let i = start; i < fixed.length; i++) {
        const c = fixed[i];
        if (esc) { esc = false; continue; }
        if (c === '\\') { esc = true; continue; }
        if (c === '"') {
          // Look ahead: if next non-space is } or , then this is likely closing
          let j = i + 1;
          while (j < fixed.length && /\s/.test(fixed[j])) j++;
          const next = fixed[j];
          if (next === '}' || next === ',' || next === ']') {
            // Check if remaining has balanced braces
            end = i;
            break;
          }
          // Otherwise it's an inner quote — escape it
          // We will escape by inserting \ before it
          fixed = fixed.slice(0, i) + '\\' + fixed.slice(i);
          offset++;
          // Adjust exec index
          contentKeyRegex.lastIndex += 1;
          i++; // skip inserted \
        }
      }
      if (end !== -1) break; // fixed one content field, loop will re-check
    }
    out = fixed;
  }
  return out.replace(/,\s*([}\]])/g, '$1'); // trailing commas
}

// Helper: find string value for a given key in a JSON-like string, tolerant to raw newlines/quotes
function findStringValueLenient(src: string, key: string): string | null {
  const keyIdx = src.indexOf(`"${key}"`);
  if (keyIdx === -1) return null;
  const colonIdx = src.indexOf(':', keyIdx);
  if (colonIdx === -1) return null;
  let openIdx = src.indexOf('"', colonIdx);
  if (openIdx === -1) return null;
  // For path, find closing quote that is not escaped and followed by , or }
  for (let i = openIdx + 1; i < src.length; i++) {
    if (src[i] === '\\') { i++; continue; }
    if (src[i] === '"') {
      let j = i + 1;
      while (j < src.length && /\s/.test(src[j])) j++;
      const nxt = src[j];
      if (nxt === ',' || nxt === '}' || nxt === ']') {
        return src.slice(openIdx + 1, i);
      }
    }
  }
  return null;
}

// Lenient write_file extraction that works even when content contains raw quotes/newlines/```
function tryParseWriteFileLenient(raw: string): ToolCall[] | null {
  if (!/write_file/.test(raw)) return null;
  const path = findStringValueLenient(raw, 'path');
  if (!path) return null;
  // Content is special: take everything between "content":" and the last " before final }
  const contentKeyIdx = raw.indexOf('"content"');
  if (contentKeyIdx === -1) return null;
  const colonIdx = raw.indexOf(':', contentKeyIdx);
  if (colonIdx === -1) return null;
  const openIdx = raw.indexOf('"', colonIdx);
  if (openIdx === -1) return null;
  // Find last } in raw
  const lastBrace = raw.lastIndexOf('}');
  if (lastBrace === -1) return null;
  // Find last unescaped " before lastBrace
  let closeIdx = -1;
  for (let i = lastBrace - 1; i > openIdx; i--) {
    if (raw[i] === '"') {
      // count preceding backslashes
      let bs = 0;
      for (let k = i - 1; k >= 0 && raw[k] === '\\'; k--) bs++;
      if (bs % 2 === 0) { closeIdx = i; break; }
    }
  }
  if (closeIdx === -1 || closeIdx <= openIdx) return null;
  let content = raw.slice(openIdx + 1, closeIdx);
  // Unescape JSON escapes that are valid (keep raw newlines as is)
  // Convert \n, \r, \t, \", \\, \uXXXX
  try {
    // Use JSON trick to unescape if needed: wrap in quotes and parse
    content = JSON.parse(`"${content.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\\\\"/g, '\\"')}"`);
  } catch {
    // If parse fails, keep raw content but unescape common sequences manually
    content = content.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  // Actually, the sliced content already contains raw newlines correctly; if we did over-escaping, revert:
  // The safest is to just use the raw slice directly if it contains real newlines
  // Detect: if raw slice contains literal newline, keep it; otherwise unescape
  if (raw.slice(openIdx + 1, closeIdx).includes('\n')) {
    content = raw.slice(openIdx + 1, closeIdx);
  }
  // Also try to get content via direct slice without JSON parse for raw case
  const rawContent = raw.slice(openIdx + 1, closeIdx);
  // Prefer raw if it looks more complete (contains newlines)
  if (rawContent.length > content.length) content = rawContent;
  // Handle escaped content: if content still has \\n literals, convert
  if (!content.includes('\n') && content.includes('\\n')) {
    content = content.replace(/\\n/g, '\n').replace(/\\"/g, '"');
  }
  return [{ tool: 'write_file', input: { tool: 'write_file', path, content } }];
}

function tryParseWriteFileTruncated(raw: string): ToolCall[] | null {
  if (!/write_file/.test(raw)) return null;
  const path = findStringValueLenient(raw, 'path');
  if (!path) return null;
  const contentKeyIdx = raw.indexOf('"content"');
  if (contentKeyIdx === -1) return null;
  const colonIdx = raw.indexOf(':', contentKeyIdx);
  if (colonIdx === -1) return null;
  const openIdx = raw.indexOf('"', colonIdx);
  if (openIdx === -1) return null;
  // Truncated: no closing quote/brace, take everything after openIdx+1 as content
  let content = raw.slice(openIdx + 1);
  // Remove trailing ``` if present (fence leftover)
  content = content.replace(/```[\s\S]*$/, '');
  // Remove trailing incomplete JSON tail like `",` or `}`
  content = content.replace(/"\s*,?\s*\}?\s*$/, '');
  // Unescape if needed
  content = content.replace(/\\n/g, '\n').replace(/\\"/g, '"');
  if (content.trim().length < 10) return null;
  return [{ tool: 'write_file', input: { tool: 'write_file', path, content } }];
}

function extractAllToolObjects(text: string): string[] {
  const objs: string[] = [];
  let idx = 0;
  while (idx < text.length) {
    const start = text.indexOf('{"tool"', idx);
    const start2 = text.indexOf('{"tool":', idx);
    const s = start !== -1 ? start : start2;
    if (s === -1) break;
    const obj = extractBalancedObject(text.slice(s));
    if (obj) {
      objs.push(obj);
      idx = s + obj.length;
    } else {
      const trunc = text.slice(s, s + 50000);
      const m = trunc.match(/"tool"\s*:\s*"write_file"[\s\S]{0,500}"content"\s*:\s*"/);
      if (m) {
        // Take until end of text or next tool start
        const nextTool = text.indexOf('{"tool"', s + 1);
        const slice = nextTool !== -1 ? text.slice(s, nextTool) : text.slice(s);
        objs.push(slice);
        idx = s + slice.length;
      } else {
        idx = s + 8;
      }
    }
  }
  return objs;
}

/** Extract a balanced {...} block starting at the first "{" (string-aware). */
function extractBalancedObject(src: string): string | null {
  const start = src.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  // Unbalanced (truncated output) — close what is open
  let repaired = src.slice(start);
  if (inString) repaired += '"';
  repaired += '}'.repeat(Math.max(depth, 1));
  return repaired;
}

function toCalls(parsed: unknown): ToolCall[] | null {
  const items = Array.isArray(parsed) ? parsed : [parsed];
  const calls: ToolCall[] = [];
  for (const item of items) {
    if (item && typeof (item as { tool?: unknown }).tool === 'string') {
      calls.push({ tool: (item as { tool: string }).tool, input: item as Record<string, unknown> });
    }
  }
  return calls.length > 0 ? calls : null;
}

function parseToolObject(raw: string): ToolCall[] | null {
  const candidates = [raw.trim(), repairJson(raw.trim())];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const calls = toCalls(parsed);
      if (calls) return calls;
    } catch {
      /* next strategy */
    }
  }
  const obj = extractBalancedObject(raw);
  if (obj) {
    try {
      return toCalls(JSON.parse(repairJson(obj)));
    } catch {
      /* give up */
    }
  }
  return null;
}

export function parseToolCalls(text: string): { calls: ToolCall[]; cleanText: string } {
  const calls: ToolCall[] = [];
  let clean = text;
  let m: RegExpExecArray | null;

  // 0a) Handle <dots_function_call>...</dots_function_call> (some models hallucinate this)
  const dotsRe = /<dots_function_call[^>]*>([\s\S]*?)<\/dots_function_call>/gi;
  while ((m = dotsRe.exec(text)) !== null) {
    const inner = m[1];
    const invokeM = inner.match(/<invoke[^>]*name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/invoke>/i);
    if (invokeM) {
      const tool = invokeM[1].trim();
      const paramsBlock = invokeM[2];
      const input: Record<string, unknown> = { tool };
      const paramRe = /<parameter[^>]*name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/parameter>/gi;
      let pm: RegExpExecArray | null;
      while ((pm = paramRe.exec(paramsBlock)) !== null) {
        input[pm[1]] = pm[2].trim();
      }
      // Fallback: if no <parameter> found, try to parse as JSON inside invoke
      if (Object.keys(input).length === 1) {
        try {
          const maybeJson = JSON.parse(paramsBlock.trim());
          if (typeof maybeJson === 'object') Object.assign(input, maybeJson);
        } catch {}
      }
      calls.push({ tool, input });
      clean = clean.replace(m[0], '');
      continue;
    }
    // Fallback: try to extract <parameter> directly even without <invoke>
    const paramRe2 = /<parameter[^>]*name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/parameter>/gi;
    let pm2: RegExpExecArray | null;
    const fallbackInput: Record<string, unknown> = { tool: 'run_command' };
    let found = false;
    while ((pm2 = paramRe2.exec(inner)) !== null) { fallbackInput[pm2[1]] = pm2[2].trim(); found = true; }
    if (found) { calls.push({ tool: String(fallbackInput.tool || 'run_command'), input: fallbackInput }); clean = clean.replace(m[0], ''); }
  }

  // 0) Handle <tool_call>...</tool_call> format (MiniMax M3, Qwen, some OpenRouter models)
  // Examples: <tool_call>list_files</tool_call> or <tool_call>{"tool":"write_file",...}</tool_call>
  const toolCallRe = /<tool_call[^>]*>([\s\S]*?)<\/tool_call>/gi;
  while ((m = toolCallRe.exec(text)) !== null) {
    const inner = m[1].trim();
    let parsed: ToolCall[] | null = null;
    if (inner) {
      parsed = parseToolObject(inner);
      if (!parsed) parsed = tryParseWriteFileLenient(inner);
      if (!parsed) parsed = tryParseWriteFileTruncated(inner);
      if (!parsed) {
        // Simple tool name without JSON, e.g. "list_files"
        const simple = inner.trim().toLowerCase().replace(/["'{}\s]/g, '');
        if (simple === 'list_files') {
          parsed = [{ tool: 'list_files', input: { tool: 'list_files' } }];
        } else if (/^read_file|write_file|delete_file|run_command$/.test(simple)) {
          // Tool name alone without args — will fail gracefully but we still count it to avoid showing as text
          parsed = [{ tool: simple, input: { tool: simple } }];
        }
        // XML-like <tool>write_file</tool><path>...</path><content>...</content>
        if (!parsed && /<tool>/i.test(inner)) {
          const toolM = inner.match(/<tool>\s*([^<]+)\s*<\/tool>/i);
          const pathM = inner.match(/<path>\s*([^<]+)\s*<\/path>/i);
          const contentM = inner.match(/<content>([\s\S]*?)<\/content>/i);
          const commandM = inner.match(/<command>([\s\S]*?)<\/command>/i);
          if (toolM) {
            const t = toolM[1].trim();
            const input: Record<string, unknown> = { tool: t };
            if (pathM) input.path = pathM[1].trim();
            if (contentM) input.content = contentM[1];
            if (commandM) input.command = commandM[1].trim();
            // Also try <arg> style
            if (!input.path) {
              const argPath = inner.match(/<arg[^>]*name=["']path["'][^>]*>([\s\S]*?)<\/arg>/i);
              if (argPath) input.path = argPath[1].trim();
            }
            if (!input.content) {
              const argContent = inner.match(/<arg[^>]*name=["']content["'][^>]*>([\s\S]*?)<\/arg>/i);
              if (argContent) input.content = argContent[1];
            }
            parsed = [{ tool: t, input }];
          }
        }
      }
    }
    if (parsed && parsed.length > 0) {
      calls.push(...parsed);
      clean = clean.replace(m[0], '');
    } else if (inner && /write_file|read_file|list_files/i.test(inner)) {
      // Even if parse failed but inner clearly contains a tool intent, remove the tag to avoid showing as text
      // and try to salvage as lenient write_file
      const salvage = tryParseWriteFileLenient(m[0]);
      if (salvage) {
        calls.push(...salvage);
        clean = clean.replace(m[0], '');
      } else {
        clean = clean.replace(m[0], `[tool ${inner.slice(0, 80)} — parsing failed]`);
      }
    }
  }

  // 1) Accept ```tool, ```tool_call, ```tool_use and ```json blocks (case-insensitive)
  const re = /```[ \t]*(tool[a-zA-Z_-]*|json)[ \t]*\r?\n([\s\S]*?)```/gi;
  const fenceBlocks: string[] = [];
  while ((m = re.exec(text)) !== null) {
    fenceBlocks.push(m[0]);
    let parsed = parseToolObject(m[2]);
    if (!parsed) parsed = tryParseWriteFileLenient(m[2]);
    if (parsed) {
      calls.push(...parsed);
      clean = clean.replace(m[0], '');
    } else {
      // Try truncated inside fence
      const trunc = tryParseWriteFileTruncated(m[2]);
      if (trunc) {
        calls.push(...trunc);
        clean = clean.replace(m[0], '');
      }
    }
  }
  // If no calls from fences, scan whole text for balanced objects containing "tool"
  if (calls.length === 0) {
    const brute = extractAllToolObjects(text);
    for (const obj of brute) {
      let parsed = parseToolObject(obj);
      if (!parsed) parsed = tryParseWriteFileLenient(obj);
      if (!parsed) parsed = tryParseWriteFileTruncated(obj);
      if (parsed) {
        calls.push(...parsed);
        clean = clean.replace(obj, '');
      }
    }
  }
  // Truncated final block (model ran out of tokens before closing the fence)
  if (calls.length === 0) {
    const tail = text.match(/```[ \t]*tool[a-z_-]*[ \t]*\r?\n([\s\S]+)$/i);
    if (tail) {
      let parsed = parseToolObject(tail[1]);
      if (!parsed) parsed = tryParseWriteFileLenient(tail[1]);
      if (!parsed) parsed = tryParseWriteFileTruncated(tail[1]);
      if (parsed) {
        calls.push(...parsed);
        clean = clean.replace(tail[0], '');
      }
    }
  }
  if (calls.length === 0 && /write_file/.test(text) && !text.includes('```tool')) {
    const direct = tryParseWriteFileLenient(text) || tryParseWriteFileTruncated(text);
    if (direct) {
      calls.push(...direct);
      const obj = extractBalancedObject(text);
      if (obj) clean = clean.replace(obj, '');
      else clean = clean.replace(/\{[^{}]*"tool"\s*:\s*"write_file"[\s\S]*?\}/g, '');
    } else {
      // Even if parse failed, hide raw tool JSON from chat to avoid showing code
      const maybe = text.match(/\{[^{}]*"tool"\s*:\s*"write_file"[\s\S]{0,500}"path"[\s\S]*?\}/);
      if (maybe) clean = clean.replace(maybe[0], '[tool write_file — will retry with proper format]');
      else clean = clean.replace(/\{"tool"\s*:\s*"write_file"[\s\S]*?\}/g, '[tool write_file]');
    }
  }
  // Always hide any remaining raw tool JSON that slipped through
  if (calls.length > 0) {
    clean = clean.replace(/\{"tool"\s*:\s*"write_file"[\s\S]*?"content"\s*:\s*"[\s\S]*?"\s*\}/g, '');
  }
  return { calls, cleanText: clean.trim() };
}

function resolvePath(p: string): string {
  const root = useFileStore.getState().root || '';
  // Prevent path traversal outside workspace (security)
  const normalized = p.replace(/^\.\//, '').replace(/\//g, '\\').replace(/\.\.\\/g, '');
  if (/^[a-zA-Z]:[\\/]/.test(p)) {
    // Absolute path — must be inside workspace root
    const abs = p.replace(/\//g, '\\');
    if (root && !abs.toLowerCase().startsWith(root.toLowerCase())) {
      throw new Error(`Path traversal blocked: ${p} is outside workspace`);
    }
    return abs;
  }
  const full = `${root}${root.endsWith('\\') ? '' : '\\'}${normalized}`;
  // Normalize and verify still inside root
  const normalizedFull = full.replace(/\\/g, '\\');
  if (root && !normalizedFull.toLowerCase().startsWith(root.toLowerCase())) {
    throw new Error(`Path traversal blocked: ${p}`);
  }
  return full;
}

function relPath(p: string): string {
  const root = useFileStore.getState().root || '';
  return p.startsWith(root) ? p.slice(root.length).replace(/^[\\/]/, '') : p;
}

export async function executeTool(call: ToolCall): Promise<{ output: string; step: AgentStep }> {
  const step: AgentStep = { tool: call.tool, input: call.input, status: 'running' };
  try {
    switch (call.tool) {
      case 'list_files': {
        const root = useFileStore.getState().root;
        if (!root) throw new Error('No folder open');
        const files = await window.velo.listAllFiles(root);
        const list = files.slice(0, 500).map(relPath).join('\n');
        const truncated = files.length > 500 ? `\n... +${files.length - 500} more files (truncated)` : '';
        step.output = (list || '(empty workspace)') + truncated;
        break;
      }
      case 'read_file': {
        const p = resolvePath(String(call.input.path || ''));
        const res = await window.velo.readFile(p);
        if (res.binary) throw new Error('Binary file — cannot read as text');
        const sliced = res.content.slice(0, 40000);
        const truncNote = res.content.length > 40000 ? `\n... [truncated ${res.content.length - 40000} chars]` : '';
        const emptyNote = res.truncated ? ' [file truncated to 4MB on disk]' : '';
        step.output = (sliced || '(empty file)') + truncNote + emptyNote;
        break;
      }
      case 'write_file': {
        const p = resolvePath(String(call.input.path || ''));
        // Content may be object/number if LLM malformed — stringify safely
        let content: string;
        if (typeof call.input.content === 'string') content = call.input.content;
        else if (call.input.content == null) content = '';
        else if (typeof call.input.content === 'object') {
          try { content = JSON.stringify(call.input.content, null, 2); } catch { content = String(call.input.content); }
        } else content = String(call.input.content ?? '');
        let original = '';
        try {
          const res = await window.velo.readFile(p);
          original = res.binary ? '' : res.content;
        } catch {
          original = '';
        }
        await window.velo.writeFile(p, content);
        step.originalContent = original;
        step.targetPath = p;
        step.output = `OK — wrote ${content.split('\n').length} lines to ${relPath(p)}${original ? ' (replaced existing file)' : ' (new file)'}`;
        const tab = useEditorStore.getState().tabs.find((t) => t.path === p && t.kind === 'file');
        if (tab && !tab.dirty) void useEditorStore.getState().reloadTabFromDisk(p);
        else if (tab && tab.dirty) {
          const { useUIStore } = await import('../store/useUIStore');
          useUIStore.getState().showToast(`Agent updated ${relPath(p)} on disk — you have unsaved changes in the editor`, 'error');
        }
        await useFileStore.getState().refresh();
        break;
      }
      case 'delete_file': {
        const p = resolvePath(String(call.input.path || ''));
        await window.velo.deletePath(p);
        step.output = `OK — deleted ${relPath(p)}`;
        useEditorStore.getState().tabs
          .filter((t) => t.path === p)
          .forEach((t) => useEditorStore.getState().closeTab(t.id));
        await useFileStore.getState().refresh();
        break;
      }
      case 'run_command': {
        const root = useFileStore.getState().root || '';
        const command = String(call.input.command || '');
        const res = await window.velo.exec(command, root, 120000);
        const out = [res.stdout, res.stderr].filter(Boolean).join('\n').slice(0, 8000);
        step.output = `exit code ${res.code}\n${out || '(no output)'}`;
        break;
      }
      default: {
        // MCP tools: "mcp:<server>:<tool>"
        if (call.tool.startsWith('mcp:')) {
          const [, server, tool] = call.tool.split(':');
          if (!server || !tool) throw new Error(`Invalid MCP tool name: ${call.tool}`);
          const args = (call.input.arguments || call.input.args || call.input) as Record<string, unknown>;
          const res = await window.velo.mcpCallTool(server, tool, args);
          if (res.error) throw new Error(res.error);
          step.output = (res.content || '(no content)').slice(0, 8000);
          step.status = 'done';
        } else {
          throw new Error(`Unknown tool: ${call.tool}`);
        }
      }
    }
    step.status = 'done';
  } catch (err) {
    step.status = 'error';
    step.output = String(err instanceof Error ? err.message : err);
  }
  return { output: step.output || '', step };
}

export function buildProjectContext(): string {
  const { root, rootName, tree } = useFileStore.getState();
  if (!root) return 'No folder is currently open.';
  const lines: string[] = [];
  const walk = (nodes: typeof tree, depth: number) => {
    if (depth > 2) return;
    for (const n of nodes) {
      if (lines.length > 160) return;
      lines.push(`${'  '.repeat(depth)}${n.type === 'folder' ? n.name + '/' : n.name}`);
      if (n.type === 'folder' && n.children) walk(n.children, depth + 1);
    }
  };
  walk(tree, 0);
  const active = activeFileTab();
  return [
    `Workspace root: ${root}`,
    `Workspace name: ${rootName}`,
    'Project structure (depth-limited):',
    lines.join('\n'),
    active ? `\nCurrently open file: ${relPath(active.path)}\n--- open file content (truncated) ---\n${active.content.slice(0, 4000)}` : '',
  ].join('\n');
}

export const AGENT_SYSTEM_PROMPT = `You are Velo Agent, an expert autonomous coding agent running inside the Velo code editor on Windows.

CRITICAL: You ACT on the workspace by using tools. Code shown in a plain markdown block is NOT applied to any file and will be considered a FAILURE. To create or modify a file you MUST emit a tool block with the FULL file content — never show code in chat without a tool. If you show code without a tool, the task fails:

\`\`\`tool
{"tool":"write_file","path":"src/newfile.ts","content":"<FULL new file content>"}
\`\`\`

Available tools:

\`\`\`tool
{"tool":"list_files"}
\`\`\`

\`\`\`tool
{"tool":"read_file","path":"src/index.ts"}
\`\`\`

\`\`\`tool
{"tool":"write_file","path":"src/newfile.ts","content":"<FULL new file content>"}
\`\`\`

\`\`\`tool
{"tool":"delete_file","path":"src/old.ts"}
\`\`\`

\`\`\`tool
{"tool":"run_command","command":"npm install"}
\`\`\`

Rules:
- When the user asks you to build/create/fix anything, DO IT with tool blocks immediately. Never answer with only instructions or code snippets.
- Paths are relative to the workspace root. write_file replaces the ENTIRE file, so always include the complete file content.
- You may include multiple tool blocks in one reply. They run in order.
- After your tool blocks execute, you will receive a TOOL RESULTS message. Then continue: either call more tools or finish.
- When the task is complete, reply with a short summary and NO tool block.
- Prefer reading a file before rewriting it. Keep edits minimal and correct.
- For run_command, the shell is PowerShell on Windows.
- Always write complete, working code. Never use placeholders like "...rest of code...".`;

export function buildAgentSystemPrompt(mcpTools?: Array<{ server: string; name: string; description?: string }>): string {
  const mcpSection =
    mcpTools && mcpTools.length > 0
      ? `\n\nExternal MCP tools are also available. Call them with {"tool":"mcp:<server>:<tool>","input":{<arguments>}}:\n${mcpTools
          .map((t) => `- mcp:${t.server}:${t.name}${t.description ? ` — ${t.description}` : ''}`)
          .join('\n')}`
      : '';
  return `${AGENT_SYSTEM_PROMPT}${mcpSection}`;
}

export const CHAT_SYSTEM_PROMPT = `You are Velo, an expert AI programming assistant integrated into the Velo code editor.
Answer clearly and concisely. Use markdown code blocks with language tags for code.
When the user shares project context or file contents, use them to give precise, contextual answers.
If the user asks you to modify files across the project, suggest switching to Agent mode for direct edits.`;
