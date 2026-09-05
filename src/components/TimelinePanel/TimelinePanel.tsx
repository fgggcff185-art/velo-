import { useCallback, useEffect, useState } from 'react';
import { History, RotateCcw, GitCompare } from 'lucide-react';
import { useEditorStore } from '../../store/useEditorStore';
import { useUIStore } from '../../store/useUIStore';
import type { HistoryVersion } from '../../types';

function fmt(ts: number): string {
  const d = new Date(ts);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
}

export function TimelinePanel() {
  const tabs = useEditorStore((s) => s.tabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const [versions, setVersions] = useState<HistoryVersion[]>([]);

  const refresh = useCallback(async () => {
    if (!activeTab || activeTab.kind !== 'file' || activeTab.binary) {
      setVersions([]);
      return;
    }
    setVersions(await window.velo.historyList(activeTab.path));
  }, [activeTab?.path]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const viewDiff = async (ts: number) => {
    if (!activeTab) return;
    const original = await window.velo.historyRead(activeTab.path, ts);
    const ext = activeTab.path.split('.').pop() || '';
    useEditorStore.getState().openDiff({
      title: `${activeTab.name} @ ${fmt(ts)}`,
      original,
      modified: activeTab.content,
      language: ext,
    });
  };

  const restore = async (ts: number) => {
    if (!activeTab) return;
    const answer = await useUIStore
      .getState()
      .showConfirm('Restore version', `Restore ${activeTab.name} to the version from ${fmt(ts)}?`, ['Restore']);
    if (answer !== 'Restore') return;
    const content = await window.velo.historyRead(activeTab.path, ts);
    await window.velo.writeFile(activeTab.path, content);
    await useEditorStore.getState().reloadTabFromDisk(activeTab.path);
    useUIStore.getState().showToast('Version restored', 'success');
    await refresh();
  };

  if (!activeTab || activeTab.kind !== 'file' || activeTab.binary) {
    return (
      <div className="timeline-panel">
        <div className="panel-header">
          <span className="panel-title">TIMELINE</span>
        </div>
        <div className="git-empty">Open a file to see its local history.</div>
      </div>
    );
  }

  return (
    <div className="timeline-panel">
      <div className="panel-header">
        <span className="panel-title">TIMELINE</span>
        <div className="panel-actions">
          <button title="Refresh" onClick={refresh}>
            <History size={14} />
          </button>
        </div>
      </div>
      <div className="timeline-file" title={activeTab.path}>
        {activeTab.name}
      </div>
      <div className="timeline-list">
        {versions.length === 0 && (
          <div className="git-empty">No saved versions yet — versions are captured automatically as you save.</div>
        )}
        {versions.map((v) => (
          <div key={v.ts} className="timeline-item">
            <span className="timeline-date">{fmt(v.ts)}</span>
            <span className="timeline-size">{(v.size / 1024).toFixed(1)} KB</span>
            <button title="View diff" onClick={() => viewDiff(v.ts)}>
              <GitCompare size={13} />
            </button>
            <button title="Restore this version" onClick={() => restore(v.ts)}>
              <RotateCcw size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
