import { useEffect, useState } from 'react';
import { useEditorStore } from '../../store/useEditorStore';
import { getDocumentSymbols } from '../../services/symbolsService';
import { getActiveEditor } from '../Editor/setupMonaco';

const KIND_ICON: Record<string, string> = {
  function: 'ƒ',
  method: 'ƒ',
  class: 'C',
  interface: 'I',
  type: 'T',
  variable: 'v',
  section: '#',
};

export function OutlinePanel() {
  const tabs = useEditorStore((s) => s.tabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const [symbols, setSymbols] = useState<Array<{ name: string; kind: string; line: number }>>([]);
  const activeTab = tabs.find((t) => t.id === activeTabId);

  useEffect(() => {
    let cancelled = false;
    const compute = () => {
      try {
        const model = getActiveEditor()?.getModel();
        if (!model || !activeTab || activeTab.kind !== 'file' || activeTab.binary) {
          setSymbols([]);
          return;
        }
        if (!cancelled) setSymbols(getDocumentSymbols(model));
      } catch {
        /* ignore */
      }
    };
    compute();
    const t = setTimeout(compute, 400);
    const handler = () => {
      clearTimeout(t);
      setTimeout(compute, 250);
    };
    window.addEventListener('velo-cursor', handler);
    return () => {
      cancelled = true;
      clearTimeout(t);
      window.removeEventListener('velo-cursor', handler);
    };
  }, [activeTabId, activeTab?.content]);

  const jump = (line: number) => {
    if (activeTab) {
      useEditorStore.getState().setActive(activeTab.id);
      const ed = getActiveEditor();
      ed?.revealLineInCenter(line);
      ed?.setPosition({ lineNumber: line, column: 1 });
    }
  };

  if (!activeTab || activeTab.kind !== 'file' || activeTab.binary) {
    return <div className="git-empty">Open a file to see its outline.</div>;
  }

  return (
    <div className="outline-panel">
      <div className="panel-header">
        <span className="panel-title">OUTLINE</span>
      </div>
      <div className="outline-list">
        {symbols.length === 0 && <div className="git-empty">No symbols found</div>}
        {symbols.map((s, i) => (
          <div key={i} className="outline-item" onClick={() => jump(s.line)} title={`${s.name} (line ${s.line})`}>
            <span className={`outline-kind k-${s.kind}`}>{KIND_ICON[s.kind] || '•'}</span>
            <span className="outline-name">{s.name}</span>
            <span className="outline-line">{s.line}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
