import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  File as FileIcon,
  FolderClosed,
  FolderOpen,
  Plus,
  FolderPlus,
  RefreshCw,
  Trash2,
  Pencil,
  Copy,
  ExternalLink,
  X,
} from 'lucide-react';
import type { FileNode } from '../../types';
import { useFileStore } from '../../store/useFileStore';
import { useEditorStore, closeTabWithSave } from '../../store/useEditorStore';
import { useUIStore } from '../../store/useUIStore';
import { useT } from '../../services/i18n';

const EXT_COLORS: Record<string, string> = {
  ts: '#3178c6', tsx: '#3178c6', js: '#f1e05a', jsx: '#f1e05a', json: '#cbcb41',
  html: '#e34c26', css: '#563d7c', scss: '#c6538c', py: '#3572A5', rs: '#dea584',
  go: '#00ADD8', java: '#b07219', md: '#8dbaee', yml: '#cb171e', yaml: '#cb171e',
  php: '#4F5D95', rb: '#701516', c: '#555555', cpp: '#f34b7d', cs: '#178600',
  sh: '#89e051', ps1: '#012456', sql: '#e38c00', vue: '#41b883', svg: '#ffb13b',
};

function fileIconColor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return EXT_COLORS[ext] || '#8a93a5';
}

interface ContextMenuState {
  x: number;
  y: number;
  node: FileNode;
}

const TreeItem = memo(function TreeItem({ node, depth }: { node: FileNode; depth: number }) {
  const expanded = useFileStore((s) => s.expanded);
  const toggleExpanded = useFileStore((s) => s.toggleExpanded);
  const openFile = useEditorStore((s) => s.openFile);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const tabs = useEditorStore((s) => s.tabs);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(node.name);
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const isActive = activeTab?.path === node.path;
  const isOpen = expanded.has(node.path);
  const tr = useT();

  const closeMenu = useCallback(() => setMenu(null), []);

  useEffect(() => {
    if (!menu) return;
    const handler = () => closeMenu();
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [menu, closeMenu]);

  const handleRename = async () => {
    setRenaming(false);
    if (renameValue && renameValue !== node.name) {
      await window.velo.rename(node.path, renameValue);
      await useFileStore.getState().refresh();
      useUIStore.getState().showToast(`${tr('renamedTo')} ${renameValue}`, 'success');
    }
  };

  const menuItems =
    node.type === 'folder'
      ? [
          { label: tr('newFile'), icon: Plus, action: () => createIn(node.path, 'file') },
          { label: tr('newFolder'), icon: FolderPlus, action: () => createIn(node.path, 'folder') },
          { label: tr('rename'), icon: Pencil, action: () => { setRenameValue(node.name); setRenaming(true); } },
          { label: tr('delete'), icon: Trash2, action: async () => { await window.velo.deletePath(node.path); await useFileStore.getState().refresh(); } },
          { label: tr('copyPath'), icon: Copy, action: () => window.velo.copyPath(node.path) },
          { label: tr('openInExplorer'), icon: ExternalLink, action: () => window.velo.openPath(node.path) },
        ]
      : [
          { label: tr('rename'), icon: Pencil, action: () => { setRenameValue(node.name); setRenaming(true); } },
          { label: tr('delete'), icon: Trash2, action: async () => { await window.velo.deletePath(node.path); await closeTabWithSave(`file:${node.path}`); await useFileStore.getState().refresh(); } },
          { label: tr('copyPath'), icon: Copy, action: () => window.velo.copyPath(node.path) },
          { label: tr('revealInExplorer'), icon: ExternalLink, action: () => window.velo.showItemInFolder(node.path) },
        ];

  async function createIn(dir: string, kind: 'file' | 'folder') {
    const name = await useUIStore
      .getState()
      .showPrompt(kind === 'file' ? tr('newFileName') : tr('newFolderName'), '', kind === 'file' ? 'e.g. index.ts' : 'e.g. src');
    if (!name) return;
    try {
      if (kind === 'file') {
        const p = await window.velo.createFile(dir, name);
        await useFileStore.getState().refresh();
        await useEditorStore.getState().openFile(p);
      } else {
        await window.velo.createFolder(dir, name);
        await useFileStore.getState().refresh();
      }
    } catch {
      useUIStore.getState().showToast(tr('createFailed'), 'error');
    }
  }

  return (
    <div>
      <div
        className={`tree-item ${isActive ? 'active' : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => {
          if (node.type === 'folder') toggleExpanded(node.path);
          else openFile(node.path);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setMenu({ x: e.clientX, y: e.clientY, node });
        }}
        title={node.path}
      >
        {node.type === 'folder' ? (
          isOpen ? <ChevronDown size={14} className="tree-chevron" /> : <ChevronRight size={14} className="tree-chevron" />
        ) : (
          <span className="tree-chevron" />
        )}
        {node.type === 'folder' ? (
          isOpen ? <FolderOpen size={15} className="tree-folder-icon" /> : <FolderClosed size={15} className="tree-folder-icon" />
        ) : (
          <FileIcon size={14} style={{ color: fileIconColor(node.name) }} />
        )}
        {renaming ? (
          <input
            className="tree-rename-input"
            value={renameValue}
            autoFocus
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename();
              if (e.key === 'Escape') setRenaming(false);
            }}
          />
        ) : (
          <span className="tree-name">{node.name}</span>
        )}
      </div>
      {menu && (
        <div className="context-menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          {menuItems.map(({ label, icon: Icon, action }) => (
            <button
              key={label}
              className="context-menu-item"
              onClick={async () => {
                closeMenu();
                await action();
              }}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
      )}
      {node.type === 'folder' && isOpen && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeItem key={child.path} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
});

export function FileExplorer() {
  const { roots, rootName, tree, extraTrees, refresh, setRoot, addRoot, removeRoot, refreshExtra } = useFileStore();
  const root = roots[0] || null;
  const [creating, setCreating] = useState<'file' | 'folder' | null>(null);
  const [newName, setNewName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const tr = useT();

  useEffect(() => {
    const off = window.velo.onFsChanged(() => refresh());
    return off;
  }, [refresh]);

  const commitCreate = async () => {
    if (!creating || !newName.trim() || !root) return;
    try {
      if (creating === 'file') {
        const p = await window.velo.createFile(root, newName.trim());
        await refresh();
        await useEditorStore.getState().openFile(p);
      } else {
        await window.velo.createFolder(root, newName.trim());
        await refresh();
      }
    } catch {
      useUIStore.getState().showToast(tr('createFailed'), 'error');
    }
    setCreating(null);
    setNewName('');
  };

  if (!root) {
    return (
      <div className="explorer-empty">
        <p>{tr('noFolderOpened')}</p>
        <button className="btn-primary" onClick={async () => { const dir = await window.velo.openFolderDialog(); if (dir) setRoot(dir); }}>
          {tr('openFolder')}
        </button>
      </div>
    );
  }

  return (
    <div className="explorer">
      <div className="panel-header">
        <span className="panel-title">{tr('explorerTitle')}</span>
        <div className="panel-actions">
          <button title={tr('newFile')} onClick={() => { setCreating('file'); setNewName(''); setTimeout(() => inputRef.current?.focus(), 50); }}>
            <Plus size={15} />
          </button>
          <button title={tr('newFolder')} onClick={() => { setCreating('folder'); setNewName(''); setTimeout(() => inputRef.current?.focus(), 50); }}>
            <FolderPlus size={15} />
          </button>
          <button title={tr('refresh')} onClick={refresh}>
            <RefreshCw size={14} />
          </button>
          <button
            title={tr('addFolderToWorkspace')}
            onClick={async () => {
              const dir = await window.velo.openFolderDialog();
              if (dir) await addRoot(dir);
            }}
          >
            <Plus size={15} />
          </button>
        </div>
      </div>
      <div className="explorer-rootname">{rootName}</div>
      <div className="tree">
        {creating && (
          <div className="tree-item creating" style={{ paddingLeft: 8 }}>
            <span className="tree-chevron" />
            <input
              ref={inputRef}
              className="tree-rename-input"
              value={newName}
              placeholder={creating === 'file' ? tr('fileNamePlaceholder') : tr('folderNamePlaceholder')}
              onChange={(e) => setNewName(e.target.value)}
              onBlur={commitCreate}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitCreate();
                if (e.key === 'Escape') setCreating(null);
              }}
            />
          </div>
        )}
        {tree.map((node) => (
          <TreeItem key={node.path} node={node} depth={0} />
        ))}
        {roots.slice(1).map((extra) => (
          <div key={extra}>
            <div className="explorer-rootname extra">
              <span>{extra.split(/[\\/]/).filter(Boolean).pop()}</span>
              <button title={tr('refresh')} onClick={() => refreshExtra(extra)}>
                <RefreshCw size={11} />
              </button>
              <button title={tr('removeFromWorkspace')} onClick={() => removeRoot(extra)}>
                <X size={11} />
              </button>
            </div>
            {(extraTrees[extra] || []).map((node) => (
              <TreeItem key={node.path} node={node} depth={0} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
