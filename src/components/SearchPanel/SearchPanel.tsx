import { useEffect, useRef, useState, useMemo } from 'react';
import { Search, ReplaceAll, Regex, CaseSensitive, Loader2, Filter, ChevronDown } from 'lucide-react';
import { useFileStore } from '../../store/useFileStore';
import { useUIStore } from '../../store/useUIStore';
import { openPathAndReveal } from '../../store/useEditorStore';
import { useT } from '../../services/i18n';
import type { SearchResultItem } from '../../types';

function highlight(text: string, query: string, isRegex: boolean, caseSensitive: boolean): React.ReactNode {
  if (!query) return text;
  try {
    const pattern = isRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(${pattern})`, caseSensitive ? 'g' : 'gi');
    const parts = text.split(re);
    // split keeps delimiters; need to test each part if it matches
    const testRe = new RegExp(`^${pattern}$`, caseSensitive ? '' : 'i');
    return parts.map((p, i) => (testRe.test(p) ? <mark key={i} className="search-highlight">{p}</mark> : <span key={i}>{p}</span>));
  } catch {
    return text;
  }
}

export function SearchPanel() {
  const { roots } = useFileStore();
  const tr = useT();
  const [query, setQuery] = useState('');
  const [replace, setReplace] = useState('');
  const [regex, setRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [filterExt, setFilterExt] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [visibleLimit, setVisibleLimit] = useState(500);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = async () => {
    if (roots.length === 0 || !query.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    const all: SearchResultItem[] = [];
    let trunc = false;
    for (const root of roots) {
      const res = await window.velo.search(root, query, { regex, caseSensitive });
      if (res.error) useUIStore.getState().showToast(`Search error: ${res.error}`, 'error');
      all.push(...(res.results || []));
      trunc = trunc || res.truncated;
    }
    setResults(all);
    setTruncated(trunc);
    setSearching(false);
    setVisibleLimit(500);
  };

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ query: string; regex?: boolean }>).detail;
      if (detail?.query) {
        setQuery(detail.query);
        if (detail.regex !== undefined) setRegex(detail.regex);
      }
    };
    window.addEventListener('velo-run-search', handler);
    return () => window.removeEventListener('velo-run-search', handler);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(runSearch, 350);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, regex, caseSensitive, roots.join('|')]);

  // Filter by extension
  const filtered = useMemo(() => {
    if (!filterExt.trim()) return results;
    const ext = filterExt.trim().toLowerCase().replace(/^\./, '');
    return results.filter((r) => r.path.toLowerCase().endsWith(`.${ext}`));
  }, [results, filterExt]);

  const grouped = filtered.slice(0, visibleLimit).reduce<Record<string, SearchResultItem[]>>((acc, r) => {
    (acc[r.path] ||= []).push(r);
    return acc;
  }, {});

  const totalFiltered = filtered.length;
  const hasMore = filtered.length > visibleLimit || truncated;

  const replaceAll = async () => {
    const targetResults = filtered;
    if (roots.length === 0 || !query.trim() || targetResults.length === 0) return;
    const count = targetResults.length;
    let pattern: RegExp;
    try {
      pattern = new RegExp(regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? 'g' : 'gi');
    } catch {
      return;
    }
    const groupedForReplace = targetResults.reduce<Record<string, SearchResultItem[]>>((acc, r) => {
      (acc[r.path] ||= []).push(r);
      return acc;
    }, {});
    for (const path of Object.keys(groupedForReplace)) {
      const res = await window.velo.readFile(path);
      if (res.binary) continue;
      const newContent = res.content.replace(pattern, replace);
      if (newContent !== res.content) await window.velo.writeFile(path, newContent);
    }
    useUIStore.getState().showToast(`Replaced ${count} occurrence(s)`, 'success');
    await runSearch();
    await useFileStore.getState().refresh();
  };

  const hasRoots = roots.length > 0;
  const extOptions = ['', 'ts', 'tsx', 'js', 'jsx', 'py', 'json', 'css', 'html', 'md'];

  return (
    <div className="search-panel">
      <div className="panel-header">
        <span className="panel-title">{tr('search').toUpperCase()}</span>
        <span className="panel-subtitle" style={{ fontSize: 10, color: 'var(--text-3)' }}>{hasRoots ? `${roots.length} folder(s)` : ''}</span>
      </div>
      <div className="search-inputs">
        <div className="search-row">
          <div className="search-box">
            <Search size={13} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
            <input
              placeholder={hasRoots ? tr('paletteSearchFiles') : tr('noFolderOpened')}
              disabled={!hasRoots}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runSearch()}
              autoFocus
            />
            <button className={regex ? 'on' : ''} title="Regex (.*)" onClick={() => setRegex(!regex)}>
              <Regex size={14} />
            </button>
            <button className={caseSensitive ? 'on' : ''} title="Match case (Aa)" onClick={() => setCaseSensitive(!caseSensitive)}>
              <CaseSensitive size={14} />
            </button>
          </div>
        </div>
        <div className="search-row">
          <div className="search-box">
            <input placeholder={tr('replace') || 'Replace with…'} disabled={!hasRoots} value={replace} onChange={(e) => setReplace(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && replaceAll()} />
            <button title="Replace All" onClick={replaceAll} disabled={!filtered.length}>
              <ReplaceAll size={14} />
            </button>
          </div>
        </div>
        <div className="search-row">
          <div className="search-box" style={{ gap: 6 }}>
            <Filter size={13} style={{ color: 'var(--text-3)' }} />
            <select
              value={filterExt}
              onChange={(e) => setFilterExt(e.target.value)}
              title="Filter by file type"
              style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-2)', fontSize: 12, outline: 'none' }}
              disabled={!hasRoots}
            >
              <option value="">All types</option>
              {extOptions.slice(1).map((ext) => (
                <option key={ext} value={ext}>.{ext}</option>
              ))}
            </select>
            {filterExt && (
              <button title="Clear filter" onClick={() => setFilterExt('')} style={{ fontSize: 11 }}>×</button>
            )}
          </div>
        </div>
      </div>
      <div className="search-summary">
        {searching ? (
          <span className="searching">
            <Loader2 size={13} className="spin" /> {tr('statusIndexing')}
          </span>
        ) : query ? (
          <span>
            {totalFiltered} {totalFiltered === 1 ? 'result' : 'results'} in {Object.keys(grouped).length} file(s)
            {filterExt ? ` · .${filterExt}` : ''}
            {truncated ? ' · truncated (1000 max)' : ''}
            {filtered.length !== results.length ? ` · filtered from ${results.length}` : ''}
          </span>
        ) : (
          'Type to search across all files · supports regex · filter by type'
        )}
      </div>
      <div className="search-results">
        {Object.entries(grouped).map(([path, items]) => {
          const isCollapsed = collapsed.has(path);
          const name = path.split(/[\\/]/).pop() || path;
          const dir = path.slice(0, path.length - name.length);
          return (
            <div key={path}>
              <div className="search-file" onClick={() => setCollapsed((s) => { const n = new Set(s); if (n.has(path)) n.delete(path); else n.add(path); return n; })}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>{isCollapsed ? '▸' : '▾'} <span className="search-file-name">{name}</span></span>
                <span className="search-file-path" style={{ fontSize: 10, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }} title={dir}>{dir}</span>
                <span className="search-file-count">{items.length}</span>
                {isCollapsed ? <ChevronDown size={10} style={{ transform: 'rotate(-90deg)' }} /> : <ChevronDown size={10} />}
              </div>
              {!isCollapsed &&
                items.slice(0, 30).map((r, i) => (
                  <div
                    key={i}
                    className="search-result"
                    onClick={() => openPathAndReveal(r.path, r.line)}
                    title={`${r.path}:${r.line}`}
                  >
                    <span className="search-line-num">{r.line}</span>
                    <span className="search-line-text">{highlight(r.text, query, regex, caseSensitive)}</span>
                  </div>
                ))}
              {!isCollapsed && items.length > 30 && (
                <div className="search-more" style={{ padding: '4px 12px', fontSize: 11, color: 'var(--text-3)' }}>+{items.length - 30} more in this file (showing 30)</div>
              )}
            </div>
          );
        })}
        {hasMore && (
          <button className="btn-ghost small" style={{ margin: '8px 12px', width: 'calc(100% - 24px)' }} onClick={() => setVisibleLimit((v) => v + 500)}>
            Load more ({filtered.length - visibleLimit > 0 ? filtered.length - visibleLimit : truncated ? '1000+' : 0} remaining)
          </button>
        )}
        {!searching && query && filtered.length === 0 && results.length > 0 && (
          <div className="search-empty" style={{ padding: 12, textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>No results for .{filterExt} — clear filter to see {results.length} hits</div>
        )}
        {!searching && query && results.length === 0 && (
          <div className="search-empty" style={{ padding: 12, textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>No results found for "{query.slice(0, 40)}"</div>
        )}
      </div>
    </div>
  );
}
