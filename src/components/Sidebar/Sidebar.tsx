import { Files, Search, GitBranch, Bot, Settings, ListTree, History, ListChecks } from 'lucide-react';
import { useUIStore, type SidebarView } from '../../store/useUIStore';
import { FileExplorer } from '../FileExplorer/FileExplorer';
import { SearchPanel } from '../SearchPanel/SearchPanel';
import { GitPanel } from '../GitPanel/GitPanel';
import { OutlinePanel } from '../OutlinePanel/OutlinePanel';
import { TimelinePanel } from '../TimelinePanel/TimelinePanel';
import { TodoPanel } from '../TodoPanel/TodoPanel';
import { useT } from '../../services/i18n';

export function Sidebar() {
  const { sidebarView, toggleSidebarView, aiPanelOpen, toggleAIPanel, setSettingsOpen } = useUIStore();
  const tr = useT();
  const items: Array<{ id: Exclude<SidebarView, null>; icon: typeof Files; label: string }> = [
    { id: 'explorer', icon: Files, label: `${tr('explorer')} (Ctrl+B)` },
    { id: 'search', icon: Search, label: `${tr('search')} (Ctrl+Shift+F)` },
    { id: 'git', icon: GitBranch, label: tr('sourceControl') },
    { id: 'todos', icon: ListChecks, label: tr('todoTree') },
    { id: 'outline', icon: ListTree, label: tr('outline') },
    { id: 'timeline', icon: History, label: `${tr('timeline')} (Local History)` },
  ];

  return (
    <div className={`sidebar ${sidebarView ? 'has-panel' : ''}`}>
      <div className="sidebar-rail">
        <div className="rail-group">
          {items.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              className={`rail-btn ${sidebarView === id ? 'active' : ''}`}
              onClick={() => toggleSidebarView(id)}
              title={label}
            >
              <Icon size={19} strokeWidth={1.8} />
            </button>
          ))}
        </div>
        <div className="rail-group">
          <button
            className={`rail-btn ${aiPanelOpen ? 'active' : ''}`}
            onClick={toggleAIPanel}
            title={`${tr('aiChatTitle')} (Ctrl+I)`}
          >
            <Bot size={19} strokeWidth={1.8} />
          </button>
          <button className="rail-btn" onClick={() => setSettingsOpen(true)} title={tr('settings')}>
            <Settings size={19} strokeWidth={1.8} />
          </button>
        </div>
      </div>
      {sidebarView && (
        <div className="sidebar-panel">
          {sidebarView === 'explorer' && <FileExplorer />}
          {sidebarView === 'search' && <SearchPanel />}
          {sidebarView === 'git' && <GitPanel />}
          {sidebarView === 'todos' && <TodoPanel />}
          {sidebarView === 'outline' && <OutlinePanel />}
          {sidebarView === 'timeline' && <TimelinePanel />}
        </div>
      )}
    </div>
  );
}
