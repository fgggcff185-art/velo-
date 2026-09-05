import { ipcMain } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import type { McpServerConfig } from '../../src/types';

/**
 * Minimal MCP (Model Context Protocol) client over stdio.
 * Supports: initialize handshake, tools/list, tools/call.
 */

interface McpConnection {
  name: string;
  child: ChildProcess;
  buffer: string;
  nextId: number;
  pending: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>;
  tools: Array<{ name: string; description?: string }>;
  ready: boolean;
}

const connections = new Map<string, McpConnection>();

function send(conn: McpConnection, method: string, params?: unknown, isNotification = false): number | null {
  const msg: Record<string, unknown> = { jsonrpc: '2.0', method };
  if (params !== undefined) msg.params = params;
  if (!isNotification) {
    msg.id = conn.nextId++;
    conn.child.stdin?.write(JSON.stringify(msg) + '\n');
    return msg.id as number;
  }
  conn.child.stdin?.write(JSON.stringify(msg) + '\n');
  return null;
}

function handleMessage(conn: McpConnection, data: string): void {
  conn.buffer += data;
  let idx: number;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    idx = conn.buffer.indexOf('\n');
    if (idx === -1) break;
    const line = conn.buffer.slice(0, idx).trim();
    conn.buffer = conn.buffer.slice(idx + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id !== undefined && conn.pending.has(msg.id)) {
        const p = conn.pending.get(msg.id)!;
        conn.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else p.resolve(msg.result);
      }
    } catch {
      /* not JSON — ignore */
    }
  }
}

function request<T>(conn: McpConnection, method: string, params?: unknown, timeoutMs = 15000): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = send(conn, method, params);
    if (id === null) {
      reject(new Error('Cannot send notification as request'));
      return;
    }
    const timer = setTimeout(() => {
      conn.pending.delete(id);
      reject(new Error(`MCP request timeout: ${method}`));
    }, timeoutMs);
    conn.pending.set(id, {
      resolve: (v) => {
        clearTimeout(timer);
        resolve(v as T);
      },
      reject: (e) => {
        clearTimeout(timer);
        reject(e);
      },
    });
  });
}

async function connectServer(name: string, command: string, args: string[]): Promise<McpConnection> {
  await disconnectServer(name);
  const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  const conn: McpConnection = {
    name,
    child,
    buffer: '',
    nextId: 1,
    pending: new Map(),
    tools: [],
    ready: false,
  };
  child.stdout?.on('data', (d: Buffer) => handleMessage(conn, d.toString('utf8')));
  child.stderr?.on('data', () => undefined); // servers log to stderr
  child.on('exit', () => {
    connections.delete(name);
  });

  await request(conn, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'Velo', version: '1.0.0' },
  });
  send(conn, 'notifications/initialized', undefined, true);
  const toolsResult = await request<{ tools?: Array<{ name: string; description?: string }> }>(
    conn,
    'tools/list',
    {},
    20000
  ).catch(() => ({ tools: [] }));
  conn.tools = toolsResult.tools || [];
  conn.ready = true;
  connections.set(name, conn);
  return conn;
}

async function disconnectServer(name: string): Promise<void> {
  const conn = connections.get(name);
  if (!conn) return;
  connections.delete(name);
  try {
    conn.child.kill();
  } catch {
    /* already dead */
  }
}

export function registerMcpHandlers(): void {
  ipcMain.handle('mcp:connect', async (_e, name: string) => {
    try {
      const { loadSettingsRaw } = await import('./storeHandler');
      const settings = loadSettingsRaw();
      const server = (settings.mcpServers || ([] as McpServerConfig[])).find((s: McpServerConfig) => s.name === name);
      if (!server) throw new Error(`MCP server "${name}" not configured`);
      const conn = await connectServer(name, server.command, server.args || []);
      return { tools: conn.tools };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('mcp:disconnect', async (_e, name: string) => {
    await disconnectServer(name);
    return true;
  });

  ipcMain.handle('mcp:call-tool', async (_e, name: string, tool: string, args: Record<string, unknown>) => {
    try {
      let conn = connections.get(name);
      if (!conn || !conn.ready) {
        const { loadSettingsRaw } = await import('./storeHandler');
        const settings = loadSettingsRaw();
        const server = (settings.mcpServers || ([] as McpServerConfig[])).find((s: McpServerConfig) => s.name === name);
        if (!server) throw new Error(`MCP server "${name}" not configured`);
        conn = await connectServer(name, server.command, server.args || []);
      }
      const result = await request<{
        content?: Array<{ type: string; text?: string }>;
        isError?: boolean;
      }>(conn, 'tools/call', { name: tool, arguments: args }, 60000);
      const text = (result.content || [])
        .map((c) => (c.type === 'text' ? c.text : JSON.stringify(c)))
        .join('\n');
      if (result.isError) return { error: text || 'MCP tool error' };
      return { content: text };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });
}
