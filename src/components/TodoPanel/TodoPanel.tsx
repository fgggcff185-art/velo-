import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useFileStore } from '../../store/useFileStore';
import { openPathAndReveal } from '../../store/useEditorStore';
import type { SearchResultItem } from '../../types';

const TODO_RE = '\\b(TODO|FIXME|HACK|XXX|BUG|NOTE)\\b';

export function TodoPanel() {
  const { roots, refresh } = useFileStore();
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);

  const scan = useCallback(async () => {
    if (roots.length === 0) {
      setResults([]);
      return;
    }
    setLoading(true);
    const all: SearchResultItem[] = [];
    for (const root of roots) {
      const res = await window.velo.search(root, TODO_RE, { regex: true, caseSensitive: true });
      all.push(...(res.results || []).slice(0, 200));
    }
    setResults(all);
    setLoading(false);
  }, [roots.join('|')]);

  useEffect(() => {
    scan();
  }, [scan]);

  const grouped = results.reduce<Record<string, SearchResultItem[]>>((acc, r) => {
    (acc[r.path] ||= []).push(r);
    return acc;
  }, {});

  return (
    <div className="todo-panel">
      <div className="panel-header">
        <span className="panel-title">TODO TREE</span>
        <span className="badge">{results.length}</span>
        <div className="panel-actions">
          <button
            title="Refresh"
            onClick={async () => {
              await refresh();
              scan();
            }}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>
      <div className="todo-list">
        {results.length === 0 && <div className="git-empty">No TODO / FIXME found ✓</div>}
        {Object.entries(grouped).map(([path, items]) => (
          <div key={path}>
            <div className="search-file">
              <span className="search-file-name">{path.split(/[\\/]/).pop()}</span>
              <span className="search-file-count">{items.length}</span>
            </div>
            {items.slice(0, 30).map((r, i) => (
              <div key={i} className="todo-item" onClick={() => openPathAndReveal(r.path, r.line)} title={r.path}>
                <span className={`todo-tag ${r.text.includes('FIXME') || r.text.includes('BUG') ? 'bad' : 'warn'}`}>
                  {r.text.match(TODO_RE)?.[0]}
                </span>
                <span className="todo-text">{r.text.replace(/^\s*/, '').slice(0, 80)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
