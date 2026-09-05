import { useEffect, useMemo, useState } from 'react';
import { Download, Trash2, Search, Palette, Sparkles, Check, Star, Ban } from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useUIStore } from '../../store/useUIStore';
import { applyCssVars, resolveExtTheme } from '../../services/themeConverterService';
import { FEATURED_CATEGORIES, FEATURED_EXTENSIONS } from '../../services/featuredExtensions';
import type { Snippet } from '../../types';

interface SearchExt {
  id: string;
  displayName?: string;
  description?: string;
  downloadCount?: number;
  rating?: number;
  download?: string;
  version?: string;
}

interface InstalledExt {
  id: string;
  displayName: string;
  version?: string;
  description?: string;
  themes: Array<{ label: string; path: string; uiTheme?: string }>;
  snippets: string[];
}

function fmtCount(n?: number): string {
  if (!n) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export function MarketplaceTab() {
  const { settings, update } = useSettingsStore();
  const showToast = useUIStore((s) => s.showToast);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [results, setResults] = useState<SearchExt[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [installed, setInstalled] = useState<InstalledExt[]>([]);
  const [installing, setInstalling] = useState<string | null>(null);

  const refreshInstalled = () => {
    window.velo
      .extInstalled()
      .then((r) => setInstalled(r.extensions || []))
      .catch(() => undefined);
  };

  useEffect(() => {
    refreshInstalled();
    doSearch('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doSearch = async (q: string) => {
    setSearching(true);
    setError('');
    const res = await window.velo.extSearch(q, category || undefined);
    if (res.error) setError(res.error);
    else setResults(res.extensions || []);
    setSearching(false);
  };

  const install = async (ext: SearchExt) => {
    if (!ext.download) {
      showToast('No download available for this extension', 'error');
      return;
    }
    setInstalling(ext.id);
    const res = await window.velo.extInstall(ext.id, ext.download);
    setInstalling(null);
    if ('error' in res && res.error) {
      showToast(`Install failed: ${res.error}`, 'error');
      return;
    }
    showToast(`${ext.displayName} installed`, 'success');
    refreshInstalled();

    // auto-register snippets from the extension
    const inst = (res as { installed?: InstalledExt }).installed;
    if (inst?.snippets?.length) {
      const merged = { ...(settings.snippets || {}) };
      for (const snippetPath of inst.snippets) {
        try {
          const raw = await window.velo.extReadFile(snippetPath);
          if (typeof raw !== 'string') continue;
          const json = JSON.parse(raw) as Record<string, Array<{ prefix: string; body: string | string[]; description?: string; scope?: string }>>;
          for (const [, items] of Object.entries(json)) {
            for (const item of items) {
              const body = Array.isArray(item.body) ? item.body.join('\n') : item.body;
              const scopeLang = (item.scope || 'javascript').split(',')[0].trim();
              const list: Snippet[] = merged[scopeLang] || [];
              if (!list.some((s) => s.prefix === item.prefix)) {
                list.push({ prefix: item.prefix, body, desc: item.description });
                merged[scopeLang] = list;
              }
            }
          }
        } catch {
          /* skip malformed snippet files */
        }
      }
      await update({ snippets: merged });
      showToast('Snippets registered — reload window to activate', 'info');
    }
  };

  const uninstall = async (id: string) => {
    await window.velo.extUninstall(id);
    if (settings.theme.startsWith(`ext:${id}:`)) {
      await update({ theme: 'velo-dark' });
      applyCssVars(null);
    }
    showToast('Extension removed', 'success');
    refreshInstalled();
  };

  const applyTheme = async (value: string) => {
    await update({ theme: value });
    if (value.startsWith('ext:')) {
      const converted = await resolveExtTheme(value);
      if (converted) {
        applyCssVars(converted);
        showToast(`Theme applied: ${converted.label}`, 'success');
      }
    } else {
      applyCssVars(null);
    }
  };

  // ===== Featured catalog =====
  const [featuredCategory, setFeaturedCategory] = useState<string>('All');
  const [featuredQuery, setFeaturedQuery] = useState('');
  const featured = useMemo(() => {
    let list = FEATURED_EXTENSIONS;
    if (featuredCategory !== 'All') list = list.filter((e) => e.category === featuredCategory);
    const q = featuredQuery.toLowerCase();
    if (q) list = list.filter((e) => e.name.toLowerCase().includes(q) || e.desc.toLowerCase().includes(q));
    return list;
  }, [featuredCategory, featuredQuery]);

  const [installingFeatured, setInstallingFeatured] = useState<string | null>(null);

  const installFeatured = async (vsId: string, name: string) => {
    setInstallingFeatured(vsId);
    try {
      const searchTerm = name.replace(/[^a-zA-Z0-9 ]/g, ' ').trim();
      const res = await window.velo.extSearch(searchTerm);
      const match = (res.extensions || []).find(
        (e) => e.download && (e.displayName?.toLowerCase().includes(name.toLowerCase().split(' ')[0]) || e.name === vsId.split('.')[1])
      ) || (res.extensions || []).find((e) => e.download);
      if (!match) {
        showToast(`"${name}" not found on Open VSX`, 'error');
        return;
      }
      await install(match);
    } finally {
      setInstallingFeatured(null);
    }
  };

  return (
    <>
      <p className="settings-hint">
        Browse and install <strong>themes & snippets</strong> from the open Open VSX registry — the free, open
        extension ecosystem used by VS Code, VSCodium and others. Plus the community's most-loved extensions list.
      </p>

      {/* ===== Featured catalog ===== */}
      <div className="settings-section">
        <label>
          <Star size={13} style={{ verticalAlign: -2 }} /> Featured — the community's most-loved extensions
        </label>
        <div className="featured-chips">
          {['All', ...FEATURED_CATEGORIES].map((c) => (
            <button key={c} className={`chip ${featuredCategory === c ? 'on' : ''}`} onClick={() => setFeaturedCategory(c)}>
              {c}
            </button>
          ))}
        </div>
        <input
          placeholder="Filter featured…"
          value={featuredQuery}
          onChange={(e) => setFeaturedQuery(e.target.value)}
        />
      </div>
      <div className="marketplace-list">
        {featured.map((ext) => (
          <div className="marketplace-item" key={ext.vsId}>
            <div className="mp-icon">
              {ext.status === 'native' ? <Sparkles size={18} /> : <Palette size={18} />}
            </div>
            <div className="mp-info">
              <div className="mp-title">
                {ext.name}
                <span className={`mp-badge ${ext.status}`}>{ext.status}</span>
              </div>
              <div className="mp-desc">{ext.desc}</div>
              {ext.nativeNote && <div className="mp-meta">✓ {ext.nativeNote}</div>}
              <div className="mp-meta">{ext.vsId} · {ext.category}</div>
            </div>
            {ext.status === 'install' ? (
              <button
                className="btn-primary small"
                disabled={installingFeatured === ext.vsId}
                onClick={() => installFeatured(ext.vsId, ext.name)}
              >
                {installingFeatured === ext.vsId ? '…' : <Download size={13} />} Install
              </button>
            ) : ext.status === 'native' ? (
              <button className="btn-ghost small" disabled title="Already built into Velo">
                <Check size={13} /> Built-in
              </button>
            ) : (
              <button className="btn-ghost small" disabled title="Requires the VS Code extension host — not portable">
                <Ban size={13} /> VS Code only
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="settings-section">
        <label>Installed extensions</label>
        {installed.length === 0 && <p className="settings-hint">Nothing installed yet.</p>}
        {installed.map((ext) => (
          <div className="provider-card" key={ext.id} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <strong style={{ flex: 1 }}>{ext.displayName}</strong>
              {ext.themes.length > 0 && (
                <select
                  className="terminal-profile-select"
                  value={settings.theme.startsWith(`ext:${ext.id}:`) ? settings.theme : ''}
                  onChange={(e) => e.target.value && applyTheme(e.target.value)}
                >
                  <option value="">Activate theme…</option>
                  {ext.themes.map((t, i) => (
                    <option key={t.path} value={`ext:${ext.id}:${i}`}>
                      {t.label}
                    </option>
                  ))}
                </select>
              )}
              <button className="btn-ghost small" onClick={() => uninstall(ext.id)} title="Uninstall">
                <Trash2 size={13} />
              </button>
            </div>
            {ext.description && <p className="settings-hint">{ext.description}</p>}
            <p className="settings-hint">
              {ext.themes.length > 0 && `🎨 ${ext.themes.length} theme(s)  `}
              {ext.snippets.length > 0 && `✂️ snippets registered  `}
              v{ext.version}
            </p>
          </div>
        ))}
      </div>

      <div className="settings-section">
        <label>Search the marketplace</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            style={{ flex: 1 }}
            placeholder="e.g. theme, one dark, snippets python…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && doSearch(query)}
          />
          <select
            className="terminal-profile-select"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              doSearch(query);
            }}
          >
            <option value="">All</option>
            <option value="Themes">Themes</option>
            <option value="Snippets">Snippets</option>
            <option value="Programming Languages">Languages</option>
          </select>
          <button className="btn-primary small" onClick={() => doSearch(query)}>
            <Search size={13} /> Search
          </button>
        </div>
      </div>

      {searching && <p className="settings-hint">Searching Open VSX…</p>}
      {error && <p className="settings-hint" style={{ color: 'var(--red)' }}>{error}</p>}

      <div className="marketplace-list">
        {results.map((ext) => {
          const isInstalled = installed.some((i) => i.id === ext.id);
          return (
            <div className="marketplace-item" key={ext.id}>
              <div className="mp-icon">
                {category === 'Themes' ? <Palette size={18} /> : <Sparkles size={18} />}
              </div>
              <div className="mp-info">
                <div className="mp-title">
                  {ext.displayName} <span className="mp-version">v{ext.version}</span>
                </div>
                <div className="mp-desc">{ext.description}</div>
                <div className="mp-meta">⬇ {fmtCount(ext.downloadCount)} · ★ {ext.rating?.toFixed(1) || '—'}</div>
              </div>
              <button
                className={isInstalled ? 'btn-ghost small' : 'btn-primary small'}
                disabled={isInstalled || installing === ext.id}
                onClick={() => install(ext)}
              >
                {installing === ext.id ? '…' : isInstalled ? <Check size={13} /> : <Download size={13} />}
                {isInstalled ? 'Installed' : 'Install'}
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
