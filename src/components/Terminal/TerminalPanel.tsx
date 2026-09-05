import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { Plus, X, Trash2, Columns2, Sparkles, AlertCircle } from 'lucide-react';
import { useUIStore } from '../../store/useUIStore';
import { useFileStore } from '../../store/useFileStore';
import { useSettingsStore } from '../../store/useSettingsStore';

const termTheme = {
  background: '#0a0d13',
  foreground: '#c9d4e5',
  cursor: '#38e1ff',
  selectionBackground: '#264f78',
  black: '#0a0d13',
  red: '#f76e6e',
  green: '#67e8a5',
  yellow: '#f5d76e',
  blue: '#6ea8f7',
  magenta: '#c792ea',
  cyan: '#5ce8d5',
  white: '#c9d4e5',
  brightBlack: '#5b657d',
  brightWhite: '#ffffff',
};

interface MenuState {
  x: number;
  y: number;
}

function clampMenuPos(x: number, y: number, w = 210, h = 170): { x: number; y: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cx = Math.min(x, vw - w - 8);
  const cy = Math.min(y, vh - h - 8);
  return { x: Math.max(8, cx), y: Math.max(8, cy) };
}

function getBufferTail(term: Terminal, lines = 35): string {
  const buffer = term.buffer.active;
  const start = Math.max(0, buffer.cursorY + buffer.baseY - lines);
  const out: string[] = [];
  for (let i = start; i <= buffer.cursorY + buffer.baseY; i++) {
    const line = buffer.getLine(i);
    if (line) out.push(line.translateToString(true));
  }
  return out.filter((l) => l.trim()).join('\n');
}

function XTermInstance({ id, shell, active }: { id: string; shell?: string; active: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);

  useEffect(() => {
    if (!menu) return;
    const handler = () => setMenu(null);
    const onResize = () => setMenu(null);
    window.addEventListener('mousedown', handler);
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.removeEventListener('mousedown', handler);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [menu]);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace",
      fontSize: 13,
      theme: termTheme,
      cursorBlink: true,
      smoothScrollDuration: 120,
      allowProposedApi: true,
      rightClickSelectsWord: false,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);
    termRef.current = term;
    fitRef.current = fit;

    try {
      fit.fit();
    } catch {
      /* container not sized yet */
    }

    // Ctrl+Shift+C = copy selection, Ctrl+Shift+V = paste
    term.attachCustomKeyEventHandler((ev) => {
      if (ev.type !== 'keydown' || !ev.ctrlKey || !ev.shiftKey) return true;
      const k = ev.key.toLowerCase();
      if (k === 'c') {
        const sel = term.getSelection();
        if (sel) {
          void window.velo.clipboardWrite(sel);
          term.clearSelection();
        }
        return false;
      }
      if (k === 'v') {
        void window.velo.clipboardRead().then((text) => {
          if (text) term.paste(text);
        });
        return false;
      }
      return true;
    });

    const root = useFileStore.getState().root;
    const shellToUse = shell || useSettingsStore.getState().settings.terminalShell || null;
    window.velo.terminalCreate(id, root, term.cols, term.rows, shellToUse);

    const dataDisposable = term.onData((data) => window.velo.terminalWrite(id, data));
    const resizeDisposable = term.onResize(({ cols, rows }) => window.velo.terminalResize(id, cols, rows));
    const offData = window.velo.onTerminalData((tid, data) => {
      if (tid === id) {
        term.write(data);
        (window as unknown as { __veloLastTermTail?: string }).__veloLastTermTail = getBufferTail(term);
      }
    });
    const offExit = window.velo.onTerminalExit((tid) => {
      if (tid === id) {
        term.write('\r\n\x1b[90m[process exited — click + to open a new terminal]\x1b[0m\r\n');
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      if (active) {
        try {
          fit.fit();
        } catch {
          /* ignore */
        }
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      dataDisposable.dispose();
      resizeDisposable.dispose();
      offData();
      offExit();
      window.velo.terminalKill(id);
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (active) {
      setTimeout(() => {
        try {
          fitRef.current?.fit();
        } catch {
          /* ignore */
        }
        termRef.current?.focus();
      }, 80);
    }
  }, [active]);

  const copySelection = () => {
    const sel = termRef.current?.getSelection();
    if (sel) void window.velo.clipboardWrite(sel);
    setMenu(null);
  };

  return (
    <div
      className="xterm-instance"
      ref={containerRef}
      style={{ display: active ? 'block' : 'none' }}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      {menu && (() => {
        const pos = clampMenuPos(menu.x, menu.y);
        return (
        <div className="context-menu" style={{ left: pos.x, top: pos.y }} onMouseDown={(e) => e.stopPropagation()}>
          <button className="context-menu-item" onClick={copySelection}>
            Copy (Ctrl+Shift+C)
          </button>
          <button
            className="context-menu-item"
            onClick={() => {
              void window.velo.clipboardRead().then((t) => {
                if (t) termRef.current?.paste(t);
              });
              setMenu(null);
            }}
          >
            Paste (Ctrl+Shift+V)
          </button>
          <button
            className="context-menu-item"
            onClick={() => {
              termRef.current?.selectAll();
              setMenu(null);
            }}
          >
            Select All
          </button>
          <button
            className="context-menu-item"
            onClick={() => {
              termRef.current?.clear();
              setMenu(null);
            }}
          >
            Clear
          </button>
        </div>
        );
      })()}
    </div>
  );
}

export function TerminalPanel() {
  const {
    terminalTabs,
    activeTerminalId,
    setActiveTerminal,
    addTerminal,
    removeTerminal,
    setTerminalOpen,
    terminalOpen,
    splitTerminal,
    toggleSplitTerminal,
    setBottomTab,
    bottomTab,
  } = useUIStore();
  const [shells, setShells] = useState<Array<{ name: string; path: string }>>([]);

  useEffect(() => {
    window.velo
      .detectShells()
      .then(setShells)
      .catch(() => undefined);
  }, [terminalOpen]);

  const explainError = () => {
    void (async () => {
      const { getActiveEditor } = await import('../Editor/setupMonaco');
      void getActiveEditor;
      // find the active xterm via DOM — simpler: use last terminal's buffer through a global registry
      const tail = (window as unknown as { __veloLastTermTail?: string }).__veloLastTermTail;
      const { useAIStore } = await import('../../store/useAIStore');
      await useAIStore.getState().askAI(
        `Explain this terminal output/error and give me the exact fix:\n\n\`\`\`\n${tail || '(no terminal output captured — run a command first)'}\n\`\`\``
      );
    })();
  };

  if (!terminalOpen) return null;

  const activeIdx = terminalTabs.findIndex((t) => t.id === activeTerminalId);
  const secondId = splitTerminal ? terminalTabs[activeIdx + 1]?.id ?? null : null;

  return (
    <div className="terminal-panel">
      <div className="terminal-header">
        <span className="panel-title">TERMINAL</span>
        <div className="terminal-tabs">
          {terminalTabs.map((t) => (
            <div
              key={t.id}
              className={`terminal-tab ${t.id === activeTerminalId ? 'active' : ''}`}
              onClick={() => setActiveTerminal(t.id)}
            >
              {t.name}
              <button
                className="terminal-tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  removeTerminal(t.id);
                }}
              >
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
        <div className="panel-actions">
          <select
            className="terminal-profile-select"
            title="New terminal with shell profile"
            value=""
            onChange={(e) => {
              if (e.target.value) addTerminal(e.target.value);
              e.target.value = '';
            }}
          >
            <option value="">+ Profile…</option>
            {shells.map((s) => (
              <option key={s.path} value={s.path}>
                {s.name}
              </option>
            ))}
          </select>
          <button title="Explain last error with AI" onClick={explainError}>
            <Sparkles size={14} />
          </button>
          <button title="Split Terminal" className={splitTerminal ? 'on' : ''} onClick={toggleSplitTerminal}>
            <Columns2 size={15} />
          </button>
          <button title="New Terminal" onClick={() => addTerminal()}>
            <Plus size={15} />
          </button>
          <button
            title="Problems panel"
            className={bottomTab === 'problems' ? 'on' : ''}
            onClick={() => setBottomTab(bottomTab === 'problems' ? 'terminal' : 'problems')}
          >
            <AlertCircle size={15} />
          </button>
          <button title="Kill Terminal" onClick={() => activeTerminalId && removeTerminal(activeTerminalId)}>
            <Trash2 size={14} />
          </button>
          <button title="Hide Terminal" onClick={() => setTerminalOpen(false)}>
            <X size={15} />
          </button>
        </div>
      </div>
      <div className={`terminal-body ${splitTerminal && secondId ? 'split' : ''}`}>
        {terminalTabs.map((t) => (
          <XTermInstance key={t.id} id={t.id} shell={t.shell} active={t.id === activeTerminalId || t.id === secondId} />
        ))}
      </div>
    </div>
  );
}
