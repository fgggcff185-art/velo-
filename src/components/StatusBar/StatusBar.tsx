import { useEffect, useState } from 'react';
import { GitBranch, Sparkles, Zap, Database } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useGitStore } from '../../store/useGitStore';
import { useEditorStore } from '../../store/useEditorStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useUIStore } from '../../store/useUIStore';
import { useIndexStatus } from '../../services/indexerService';
import { useAppInfo } from '../../hooks/useAppInfo';
import { useEngineStatus } from '../../services/aiService';
import { useT } from '../../services/i18n';

interface CursorEventDetail {
  line: number;
  col: number;
}

export function StatusBar() {
  const branch = useGitStore((s) => s.branch);
  const repoRoot = useGitStore((s) => s.repoRoot);
  const tabs = useEditorStore((s) => s.tabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const settings = useSettingsStore((s) => s.settings);
  const { terminalOpen, setTerminalOpen } = useUIStore();
  const indexStatus = useIndexStatus();
  const appInfo = useAppInfo();
  const engine = useEngineStatus();
  const [cursor, setCursor] = useState<CursorEventDetail>({ line: 1, col: 1 });

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const tr = useT();
  const isNativeMobile = Capacitor.isNativePlatform() || (typeof window !== 'undefined' && window.innerWidth < 768);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<CursorEventDetail>).detail;
      if (detail) setCursor(detail);
    };
    window.addEventListener('velo-cursor', handler);
    return () => window.removeEventListener('velo-cursor', handler);
  }, []);

  const cfg = settings.providers[settings.defaultProvider];
  const aiReady = settings.defaultProvider === 'ollama' || Boolean(cfg?.apiKey);

  return (
    <div className="statusbar">
      <div className="statusbar-left">
        {repoRoot && (
          <span className="status-item" title="Git branch">
            <GitBranch size={12} /> {branch}
          </span>
        )}
        <span className="status-item" title="AI provider">
          <Sparkles size={12} /> {engine.activeLabel || settings.defaultProvider}
          <span className={`ai-dot ${aiReady ? 'ready' : ''}`} />
        </span>
        {engine.failoverCount > 0 && (
          <span className="status-item" title={`Last failover: ${engine.lastFailover || '—'}`}>
            ⚡ {engine.failoverCount} failover{engine.failoverCount > 1 ? 's' : ''}
          </span>
        )}
        <span
          className="status-item clickable"
          title={indexStatus.indexing ? tr('statusIndexing') : 'Codebase index (used for AI context) — click to rebuild'}
          onClick={() => {
            void import('../../services/indexerService').then((m) => m.codeIndex.rebuild());
          }}
        >
          <Database size={12} /> {indexStatus.indexing ? tr('statusIndexing') : `${indexStatus.fileCount} ${tr('statusFilesIndexed')}`}
        </span>
      </div>
      <div className="statusbar-right">
        {activeTab?.kind === 'file' && !activeTab.binary && (
          <>
            <span className="status-item">
              {tr('statusLn')} {cursor.line}, {tr('statusCol')} {cursor.col}
            </span>
            <span className="status-item">{tr('statusSpaces')}: {settings.tabSize}</span>
            <span className="status-item">UTF-8</span>
            <span className="status-item">{activeTab.language}</span>
          </>
        )}
        {!isNativeMobile && (
          <button className="status-item clickable" onClick={() => setTerminalOpen(!terminalOpen)}>
            <Zap size={12} /> {tr('statusTerminal')}
          </button>
        )}
        <span className="status-item">Velo IDE v{appInfo?.version || '2.0.0'}{isNativeMobile ? '-mobile' : ''}</span>
      </div>
    </div>
  );
}
