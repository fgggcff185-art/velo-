import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Command as CommandIcon, File as FileIcon, CornerDownLeft } from 'lucide-react';
import { useUIStore } from '../../store/useUIStore';
import { useFileStore } from '../../store/useFileStore';
import { useEditorStore, saveTabWithToast, saveAllWithToast } from '../../store/useEditorStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { runProject } from '../../services/runService';
import { codeIndex, useIndexStatus } from '../../services/indexerService';
import type { FileNode } from '../../types';
import { useT } from '../../services/i18n';

interface CommandDef {
  id: string;
  title: string;
  hint?: string;
  action: () => void | Promise<void>;
}

function fuzzyScore(query: string, target: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  let score = 0;
  let streak = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      streak++;
      score += 1 + streak * 0.5 + (i === 0 || /[/\\._-]/.test(t[i - 1] || '') ? 2 : 0);
      qi++;
    } else {
      streak = 0;
    }
  }
  return qi === q.length ? score : 0;
}

function flattenFiles(nodes: FileNode[], out: FileNode[] = []): FileNode[] {
  for (const n of nodes) {
    if (n.type === 'file') out.push(n);
    if (n.children) flattenFiles(n.children, out);
  }
  return out;
}

export function CommandPalette() {
  const { paletteOpen, paletteMode, closePalette, openPalette } = useUIStore();
  const fileStore = useFileStore();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [allFiles, setAllFiles] = useState<FileNode[]>([]);
  const [taskCommands, setTaskCommands] = useState<CommandDef[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const tr = useT();

  // Load tasks from .velo/tasks.json + npm scripts
  useEffect(() => {
    if (!paletteOpen || paletteMode !== 'commands' || !fileStore.root) return;
    void (async () => {
      const extra: CommandDef[] = [];
      try {
        const res = await window.velo.readFile(`${fileStore.root}\\.velo\\tasks.json`);
        if (!res.binary && res.content) {
          const parsed = JSON.parse(res.content);
          for (const t of parsed.tasks || []) {
            extra.push({
              id: `task-${t.label}`,
              title: `Task: ${t.label}`,
              action: () => {
                const termId = useUIStore.getState().addTerminal();
                void window.velo.terminalWrite(termId, `${t.command}\r`);
              },
            });
          }
        }
      } catch {
        /* no tasks.json */
      }
      try {
        const res = await window.velo.readFile(`${fileStore.root}\\package.json`);
        if (!res.binary && res.content) {
          const pkg = JSON.parse(res.content);
          for (const [script, cmd] of Object.entries(pkg.scripts || {})) {
            extra.push({
              id: `npm-${script}`,
              title: `npm: ${script}`,
              hint: String(cmd).slice(0, 40),
              action: () => {
                const termId = useUIStore.getState().addTerminal();
                void window.velo.terminalWrite(termId, `npm run ${script}\r`);
              },
            });
          }
        }
      } catch {
        /* no package.json */
      }
      setTaskCommands(extra);
    })();
  }, [paletteOpen, paletteMode, fileStore.root]);

  const commands: CommandDef[] = useMemo(() => {
    const ui = useUIStore.getState();
    const settings = useSettingsStore.getState().settings;
    return [
      {
        id: 'open-folder',
        title: 'File: Open Folder…',
        action: async () => {
          const dir = await window.velo.openFolderDialog();
          if (dir) await useFileStore.getState().setRoot(dir);
        },
      },
      {
        id: 'add-folder',
        title: 'File: Add Folder to Workspace…',
        action: async () => {
          const dir = await window.velo.openFolderDialog();
          if (dir) await useFileStore.getState().addRoot(dir);
        },
      },
      {
        id: 'run-project',
        title: 'Run: Run Project / Active File',
        hint: 'F5',
        action: () => runProject(),
      },
      {
        id: 'debug-node',
        title: 'Debug: Start Node.js Debugger (active file)',
        action: () => {
          const tab = useEditorStore.getState().activeTab();
          if (!tab || tab.kind !== 'file') {
            useUIStore.getState().showToast('Open a file first', 'error');
            return;
          }
          const termId = useUIStore.getState().addTerminal();
          void window.velo.terminalWrite(termId, `node --inspect-brk "${tab.path}"\r`).then(() => undefined);
          useUIStore.getState().showToast('Debugging — open chrome://inspect to attach DevTools', 'info');
        },
      },
      {
        id: 'debug-python',
        title: 'Debug: Start Python pdb (active file)',
        action: () => {
          const tab = useEditorStore.getState().activeTab();
          if (!tab || tab.kind !== 'file') {
            useUIStore.getState().showToast('Open a file first', 'error');
            return;
          }
          const termId = useUIStore.getState().addTerminal();
          void window.velo.terminalWrite(termId, `python -m pdb "${tab.path}"\r`).then(() => undefined);
        },
      },
      {
        id: 'trim-whitespace',
        title: 'Editor: Trim Trailing Whitespace',
        action: () => {
          void import('../Editor/setupMonaco').then(({ getActiveEditor, monaco }) => {
            const editor = getActiveEditor();
            const model = editor?.getModel();
            if (!editor || !model) return;
            const edits = [] as Array<{ range: InstanceType<typeof monaco.Range>; text: string }>;
            for (let i = 1; i <= model.getLineCount(); i++) {
              const line = model.getLineContent(i);
              const trimmed = line.replace(/\s+$/, '');
              if (trimmed !== line) {
                edits.push({
                  range: new monaco.Range(i, trimmed.length + 1, i, line.length + 1),
                  text: '',
                });
              }
            }
            if (edits.length) editor.executeEdits('velo-trim', edits);
            useUIStore.getState().showToast(`Trimmed ${edits.length} line(s)`, 'success');
          });
        },
      },
      {
        id: 'insert-console-log',
        title: 'Editor: Insert console.log for Variable',
        action: () => {
          void import('../Editor/setupMonaco').then(({ getActiveEditor, monaco }) => {
            const editor = getActiveEditor();
            const model = editor?.getModel();
            const pos = editor?.getPosition();
            if (!editor || !model || !pos) return;
            const word = model.getWordAtPosition(pos);
            if (!word) {
              useUIStore.getState().showToast('Place the cursor on a variable first', 'error');
              return;
            }
            const isPy = model.getLanguageId() === 'python';
            const text = isPy ? `print("${word.word}:", ${word.word})` : `console.log('${word.word}:', ${word.word});`;
            const endCol = model.getLineMaxColumn(pos.lineNumber);
            editor.executeEdits('velo-log', [
              {
                range: new monaco.Range(pos.lineNumber, endCol, pos.lineNumber, endCol),
                text: `\n${text}`,
                forceMoveMarkers: true,
              },
            ]);
          });
        },
      },
      {
        id: 'gen-docstring',
        title: 'Editor: Generate Docstring (Python)',
        action: () => {
          void import('../Editor/setupMonaco').then(({ getActiveEditor, monaco }) => {
            const editor = getActiveEditor();
            const model = editor?.getModel();
            const pos = editor?.getPosition();
            if (!editor || !model || !pos) return;
            let defLine = pos.lineNumber;
            for (let i = pos.lineNumber; i >= 1; i--) {
              if (/^\s*def\s+\w+\(/.test(model.getLineContent(i))) {
                defLine = i;
                break;
              }
            }
            const line = model.getLineContent(defLine);
            const m = line.match(/def\s+\w+\(([^)]*)\)/);
            const args = m ? m[1].split(',').map((a) => a.trim().split(':')[0].split('=' )[0].trim()).filter((a) => a && a !== 'self') : [];
            const indent = line.match(/^\s*/)?.[0] || '';
            const doc: string[] = [`"""Summary of the function.`, '', 'Args:'];
            args.forEach((a) => doc.push(`    ${a}: Description.`));
            doc.push('', 'Returns:', '    Description.');
            doc.push('"""');
            const endCol = model.getLineMaxColumn(defLine);
            const body = doc.map((l) => (l ? `${indent}    ${l}` : '')).join('\n');
            editor.executeEdits('velo-docstring', [
              {
                range: new monaco.Range(defLine, endCol, defLine, endCol),
                text: `\n${body}`,
                forceMoveMarkers: true,
              },
            ]);
            useUIStore.getState().showToast('Docstring inserted — fill in the descriptions', 'success');
          });
        },
      },
      {
        id: 'rename-tag',
        title: 'Editor: Rename HTML Tag (paired)',
        action: () => {
          void Promise.all([import('../Editor/setupMonaco'), import('../../services/editorExtras')]).then(
            ([{ getActiveEditor }, { renameTagAtPosition }]) => {
              const editor = getActiveEditor();
              const model = editor?.getModel();
              const pos = editor?.getPosition();
              if (!editor || !model || !pos) return;
              const line = model.getLineContent(pos.lineNumber);
              const before = line.slice(0, pos.column - 1);
              const m = before.match(/<([a-zA-Z][\w-]*)$/) || before.match(/<\/([a-zA-Z][\w-]*)$/);
              if (!m) {
                useUIStore.getState().showToast('Place the cursor on a tag name', 'error');
                return;
              }
              void useUIStore
                .getState()
                .showPrompt('Rename tag', m[1], 'new tag name')
                .then((newName) => {
                  if (!newName) return;
                  const ok = renameTagAtPosition(model, pos, newName);
                  if (!ok) useUIStore.getState().showToast('Could not rename tag here', 'error');
                });
            }
          );
        },
      },
      {
        id: 'markdown-preview',
        title: 'Markdown: Open Preview',
        action: () => {
          const tab = useEditorStore.getState().activeTab();
          if (!tab || tab.kind !== 'file' || tab.language !== 'markdown') {
            useUIStore.getState().showToast('Open a Markdown file first', 'error');
            return;
          }
          void import('../../services/markdownLite').then(({ markdownToHtml }) => {
            useEditorStore.getState().openHtmlPreview(tab.name, markdownToHtml(tab.content));
          });
        },
      },
      {
        id: 'view-todos',
        title: 'View: TODO Tree',
        action: () => useUIStore.getState().toggleSidebarView('todos'),
      },
      {
        id: 'goto-definition',
        title: 'Go to Definition',
        hint: 'F12',
        action: () => {
          window.dispatchEvent(new CustomEvent('velo-goto-def'));
        },
      },
      {
        id: 'find-references',
        title: 'Find References',
        hint: 'Shift+F12',
        action: () => {
          window.dispatchEvent(new CustomEvent('velo-find-refs'));
        },
      },
      {
        id: 'ai-rename',
        title: 'AI: Rename Symbol Across Project…',
        action: async () => {
          const { getActiveEditor } = await import('../Editor/setupMonaco');
          const editor = getActiveEditor();
          const model = editor?.getModel();
          const pos = editor?.getPosition();
          const word = model && pos ? model.getWordAtPosition(pos)?.word : null;
          const oldName = await useUIStore.getState().showPrompt('Rename symbol across project', word || '', 'current name');
          if (!oldName) return;
          const newName = await useUIStore.getState().showPrompt(`New name for "${oldName}"`, '', 'new name');
          if (!newName || newName === oldName) return;
          const roots = useFileStore.getState().roots;
          const esc = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          let files = 0;
          let count = 0;
          for (const root of roots) {
            const res = await window.velo.search(root, `\\b${esc}\\b`, { regex: true, caseSensitive: true });
            const paths = [...new Set((res.results || []).map((r) => r.path))];
            for (const path of paths) {
              const file = await window.velo.readFile(path);
              if (file.binary) continue;
              const matches = file.content.match(new RegExp(`\\b${esc}\\b`, 'g'));
              const updated = file.content.replace(new RegExp(`\\b${esc}\\b`, 'g'), newName);
              if (updated !== file.content) {
                await window.velo.writeFile(path, updated);
                files++;
                count += matches?.length || 0;
                const t = useEditorStore.getState().tabs.find((x) => x.path === path);
                if (t && !t.dirty) await useEditorStore.getState().reloadTabFromDisk(path);
              }
            }
          }
          await useFileStore.getState().refresh();
          useUIStore.getState().showToast(`Renamed ${count} occurrence(s) in ${files} file(s)`, 'success');
        },
      },
      {
        id: 'format-doc',
        title: 'Editor: Format Document',
        hint: 'Shift+Alt+F',
        action: () => {
          void import('../Editor/setupMonaco').then(({ getActiveEditor, monaco }) => {
            getActiveEditor()?.getAction('editor.action.formatDocument')?.run();
          });
        },
      },
      {
        id: 'fold-all',
        title: 'Editor: Fold All',
        action: () => {
          void import('../Editor/setupMonaco').then(({ getActiveEditor, monaco }) => {
            getActiveEditor()?.getAction('editor.foldAll')?.run();
          });
        },
      },
      {
        id: 'unfold-all',
        title: 'Editor: Unfold All',
        action: () => {
          void import('../Editor/setupMonaco').then(({ getActiveEditor, monaco }) => {
            getActiveEditor()?.getAction('editor.unfoldAll')?.run();
          });
        },
      },
      {
        id: 'compare-with',
        title: 'File: Compare Active File With…',
        action: async () => {
          const tab = useEditorStore.getState().activeTab();
          if (!tab || tab.kind !== 'file') {
            useUIStore.getState().showToast('Open a file first', 'error');
            return;
          }
          const otherPath = await useUIStore
            .getState()
            .showPrompt('Compare with (full file path)', '', 'C:\\path\\to\\other.ts');
          if (!otherPath) return;
          const res = await window.velo.readFile(otherPath);
          useEditorStore.getState().openDiff({
            title: `${tab.name} â†” ${otherPath.split(/[\\/]/).pop()}`,
            original: res.content,
            modified: tab.content,
            language: tab.language,
          });
        },
      },
      {
        id: 'zen',
        title: `View: Toggle Zen Mode (${ui.zenMode ? 'ON' : 'OFF'})`,
        hint: 'Ctrl+K Z',
        action: () => useUIStore.getState().toggleZen(),
      },
      {
        id: 'split-editor',
        title: 'View: Split Editor',
        hint: 'Ctrl+\\',
        action: () => useUIStore.getState().toggleSplitEditor(),
      },
      {
        id: 'problems',
        title: 'View: Show Problems Panel',
        action: () => {
          const uiState = useUIStore.getState();
          uiState.setTerminalOpen(true);
          uiState.setBottomTab('problems');
        },
      },
      {
        id: 'view-outline',
        title: 'View: Outline',
        action: () => useUIStore.getState().toggleSidebarView('outline'),
      },
      {
        id: 'view-timeline',
        title: 'View: Timeline (Local History)',
        action: () => useUIStore.getState().toggleSidebarView('timeline'),
      },
      {
        id: 'cycle-theme',
        title: 'Preferences: Cycle Theme',
        action: async () => {
          const themes = ['velo-dark', 'velo-ocean', 'velo-rose', 'velo-light'];
          const current = useSettingsStore.getState().settings.theme;
          const next = themes[(themes.indexOf(current) + 1) % themes.length];
          await useSettingsStore.getState().update({ theme: next });
          useUIStore.getState().showToast(`Theme: ${next}`, 'success');
        },
      },
      {
        id: 'rebuild-index',
        title: `AI: Rebuild Codebase Index (${codeIndex.status.getState().chunkCount} chunks)`,
        action: async () => {
          useUIStore.getState().showToast('Indexing workspace…', 'info');
          await codeIndex.rebuild();
          useUIStore.getState().showToast(`Index ready — ${codeIndex.status.getState().chunkCount} chunks`, 'success');
        },
      },
      {
        id: 'ai-team',
        title: 'AI: Agent Team (Architect → Coder → Reviewer)…',
        action: async () => {
          const goal = await useUIStore.getState().showPrompt('Agent Team goal', '', 'e.g. add user authentication');
          if (!goal) return;
          void import('../../store/useAIStore').then((m) => m.useAIStore.getState().runTeam(goal));
        },
      },
      {
        id: 'extensions',
        title: 'Extensions: Browse Marketplace…',
        action: () => {
          useUIStore.getState().setSettingsOpen(true);
          window.dispatchEvent(new CustomEvent('velo-open-marketplace'));
        },
      },
      { id: 'new-terminal', title: 'Terminal: New Terminal', hint: 'Ctrl+`', action: () => ui.addTerminal() },
      {
        id: 'toggle-terminal',
        title: 'Terminal: Toggle Terminal',
        hint: 'Ctrl+`',
        action: () => ui.setTerminalOpen(!ui.terminalOpen),
      },
      {
        id: 'toggle-ai',
        title: 'AI: Toggle Chat Panel',
        hint: 'Ctrl+I',
        action: () => ui.toggleAIPanel(),
      },
      {
        id: 'ai-new-chat',
        title: 'AI: New Chat',
        action: () => useAIStoreNewChat(),
      },
      {
        id: 'save',
        title: 'File: Save',
        hint: 'Ctrl+S',
        action: () => saveTabWithToast(useEditorStore.getState().activeTabId),
      },
      {
        id: 'save-all',
        title: 'File: Save All',
        hint: 'Ctrl+Shift+S',
        action: () => saveAllWithToast(),
      },
      { id: 'close-all', title: 'File: Close All Editors', action: () => useEditorStore.getState().closeAll() },
      {
        id: 'toggle-sidebar',
        title: 'View: Toggle Sidebar',
        hint: 'Ctrl+B',
        action: () => ui.toggleSidebarView('explorer'),
      },
      {
        id: 'settings',
        title: 'Preferences: Open Settings',
        action: () => ui.setSettingsOpen(true),
      },
      {
        id: 'ghost-toggle',
        title: `AI: Toggle Ghost Text Autocomplete (${settings.ghostText ? 'ON' : 'OFF'})`,
        action: async () => {
          const s = useSettingsStore.getState();
          await s.update({ ghostText: !s.settings.ghostText });
        },
      },
      {
        id: 'autosave-toggle',
        title: `File: Toggle Auto Save (${settings.autoSave ? 'ON' : 'OFF'})`,
        action: async () => {
          const s = useSettingsStore.getState();
          await s.update({ autoSave: !s.settings.autoSave });
          useUIStore.getState().showToast(`Auto Save ${!s.settings.autoSave ? 'enabled' : 'disabled'}`, 'success');
        },
      },
      {
        id: 'reload-window',
        title: 'Developer: Reload Window',
        action: () => window.location.reload(),
      },
      ...taskCommands,
    ];
  }, [paletteOpen, taskCommands]);

  useEffect(() => {
    if (paletteOpen) {
      setQuery(paletteMode === 'commands' ? '' : '>');
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 30);
      if (fileStore.root) {
        window.velo.listAllFiles(fileStore.root).then(async (paths) => {
          const flat = flattenFiles(fileStore.tree);
          const map = new Map(flat.map((f) => [f.path, f]));
          const missing = paths.filter((p) => !map.has(p));
          if (missing.length) {
            await useFileStore.getState().refresh();
            setAllFiles(flattenFiles(useFileStore.getState().tree));
          } else {
            setAllFiles(flat);
          }
        });
      }
    }
  }, [paletteOpen, paletteMode]);

  const isFileMode = query.startsWith('>');
  const effectiveQuery = isFileMode ? query.slice(1).trim() : query.trim();

  const results = useMemo(() => {
    if (isFileMode) {
      const root = fileStore.root || '';
      return allFiles
        .map((f) => ({ f, score: fuzzyScore(effectiveQuery, f.path.startsWith(root) ? f.path.slice(root.length + 1) : f.path) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 12)
        .map((x) => ({ kind: 'file' as const, node: x.f }));
    }
    if (!effectiveQuery) return commands.slice(0, 12).map((c) => ({ kind: 'cmd' as const, cmd: c }));
    return commands
      .map((c) => ({ c, score: fuzzyScore(effectiveQuery, c.title) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map((x) => ({ kind: 'cmd' as const, cmd: x.c }));
  }, [query, isFileMode, effectiveQuery, commands, allFiles, fileStore.root]);

  useEffect(() => setSelected(0), [query]);

  if (!paletteOpen) return null;

  const execute = async (index: number) => {
    const item = results[index];
    if (!item) return;
    closePalette();
    if (item.kind === 'cmd') await item.cmd.action();
    else await useEditorStore.getState().openFile(item.node.path);
  };

  return (
    <div className="palette-overlay" onMouseDown={closePalette}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <div className="palette-input-row">
          {isFileMode ? <Search size={16} /> : <CommandIcon size={16} />}
          <input
            ref={inputRef}
            value={query}
            placeholder={isFileMode ? tr('paletteSearchFiles') : tr('paletteTypeCommand')}
            onChange={(e) => {
              const v = e.target.value;
              if (v.startsWith('>') && paletteMode === 'commands') openPalette('files');
              else if (!v.startsWith('>') && paletteMode === 'files') openPalette('commands');
              setQuery(v);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelected((s) => Math.min(s + 1, results.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelected((s) => Math.max(s - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                execute(selected);
              } else if (e.key === 'Escape') {
                closePalette();
              }
            }}
          />
          <kbd className="palette-esc">{tr('paletteEsc')}</kbd>
        </div>
        <div className="palette-results">
          {results.length === 0 && <div className="palette-empty">{tr('paletteNoResults')}</div>}
          {results.map((item, i) => (
            <div
              key={item.kind === 'cmd' ? item.cmd.id : item.node.path}
              className={`palette-item ${i === selected ? 'selected' : ''}`}
              onMouseEnter={() => setSelected(i)}
              onClick={() => execute(i)}
            >
              {item.kind === 'cmd' ? (
                <>
                  <CommandIcon size={14} />
                  <span className="palette-item-title">{item.cmd.title}</span>
                  {item.cmd.hint && <kbd>{item.cmd.hint}</kbd>}
                </>
              ) : (
                <>
                  <FileIcon size={14} />
                  <span className="palette-item-title">
                    {item.node.name}
                    <span className="palette-item-path">
                      {item.node.path.replace(fileStore.root || '', '')}
                    </span>
                  </span>
                </>
              )}
              {i === selected && <CornerDownLeft size={13} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function useAIStoreNewChat(): void {
  void import('../../store/useAIStore').then((m) => m.useAIStore.getState().newChat());
}
