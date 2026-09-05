import { useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { useUIStore } from '../../store/useUIStore';
import { openPathAndReveal } from '../../store/useEditorStore';
import type { ProblemItem } from '../../types';

let collected: ProblemItem[] = [];
const listeners = new Set<(items: ProblemItem[]) => void>();

export function collectProblems(monacoModule: typeof import('monaco-editor')): void {
  const update = () => {
    try {
      const markers = monacoModule.editor.getModelMarkers({});
      collected = markers
        .filter((m) => m.owner !== 'velo')
        .slice(0, 300)
        .map((m) => ({
          resource: m.resource.fsPath || m.resource.toString(),
          line: m.startLineNumber,
          col: m.startColumn,
          message: m.message,
          severity: m.severity === 8 ? 'error' : m.severity === 4 ? 'warning' : 'info',
          owner: m.owner,
        }));
      listeners.forEach((fn) => fn(collected));
    } catch {
      /* ignore */
    }
  };
  monacoModule.editor.onDidChangeMarkers(() => update());
  update();
}

export function useProblems(): ProblemItem[] {
  const [items, setItems] = useState<ProblemItem[]>(collected);
  useEffect(() => {
    listeners.add(setItems);
    return () => {
      listeners.delete(setItems);
    };
  }, []);
  return items;
}

const SEV_ICON = {
  error: <AlertCircle size={13} className="sev-error" />,
  warning: <AlertTriangle size={13} className="sev-warning" />,
  info: <Info size={13} className="sev-info" />,
};

export function ProblemsPanel() {
  const { problemsOpen, setProblemsOpen, bottomTab, setBottomTab } = useUIStore();
  const items = useProblems();
  if (!problemsOpen || bottomTab !== 'problems') return null;

  return (
    <div className="terminal-panel problems-panel">
      <div className="terminal-header">
        <span className="panel-title">PROBLEMS</span>
        <span className="badge">{items.length}</span>
        <div className="panel-actions" style={{ marginLeft: 'auto' }}>
          <button title="Show Terminal" onClick={() => setBottomTab('terminal')}>
            Terminal
          </button>
          <button title="Hide" onClick={() => setProblemsOpen(false)}>
            <X size={15} />
          </button>
        </div>
      </div>
      <div className="problems-list">
        {items.length === 0 && <div className="git-empty">No problems detected ✓</div>}
        {items.map((p, i) => (
          <div
            key={i}
            className="problem-item"
            onClick={() => openPathAndReveal(p.resource, p.line)}
            title={`${p.resource}:${p.line}:${p.col}`}
          >
            {SEV_ICON[p.severity]}
            <span className="problem-msg">{p.message}</span>
            <span className="problem-loc">
              {p.resource.split(/[\\/]/).pop()}:{p.line}:{p.col}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
