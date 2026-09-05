import { useEffect, useState } from 'react';
import { GitBranch, RefreshCw, Sparkles, GitCommitHorizontal, Plus } from 'lucide-react';
import { useGitStore } from '../../store/useGitStore';
import { useFileStore } from '../../store/useFileStore';
import { useEditorStore } from '../../store/useEditorStore';
import { useUIStore } from '../../store/useUIStore';

const STATUS_COLORS: Record<string, string> = {
  M: '#e8b339',
  A: '#67e8a5',
  D: '#f76e6e',
  U: '#67e8a5',
  R: '#c792ea',
};

export function GitPanel() {
  const { root } = useFileStore();
  const { repoRoot, branch, changes, refresh, initRepo, commit, generateCommitMessage, diffForFile } = useGitStore();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root]);

  const openDiff = async (path: string) => {
    const diff = await diffForFile(path);
    if (!diff) return;
    const ext = path.split('.').pop() || '';
    useEditorStore.getState().openDiff({
      title: `${path} (Working Tree)`,
      original: diff.original,
      modified: diff.modified,
      language: ext,
    });
  };

  const doCommit = async () => {
    if (!message.trim()) return;
    setBusy(true);
    const err = await commit(message.trim());
    setBusy(false);
    if (err) useUIStore.getState().showToast(err, 'error');
    else {
      useUIStore.getState().showToast('Committed successfully', 'success');
      setMessage('');
    }
  };

  const aiMessage = async () => {
    setBusy(true);
    const msg = await generateCommitMessage();
    setBusy(false);
    if (msg) setMessage(msg);
    else useUIStore.getState().showToast('Could not generate message — check AI settings', 'error');
  };

  return (
    <div className="git-panel">
      <div className="panel-header">
        <span className="panel-title">SOURCE CONTROL</span>
        <div className="panel-actions">
          <button title="Refresh" onClick={refresh}>
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {!root ? (
        <div className="git-empty">Open a folder to use source control.</div>
      ) : !repoRoot ? (
        <div className="git-empty">
          <p>No git repository found in this folder.</p>
          <button className="btn-primary" onClick={initRepo}>
            <Plus size={14} /> Initialize Repository
          </button>
        </div>
      ) : (
        <>
          <div className="git-branch">
            <GitBranch size={14} /> {branch || 'main'}
          </div>
          <div className="git-commit-box">
            <div className="commit-prefixes">
              {['feat', 'fix', 'docs', 'style', 'refactor', 'test', 'chore'].map((p) => (
                <button
                  key={p}
                  className="commit-prefix-btn"
                  title={`Conventional commit: ${p}:`}
                  onClick={() => setMessage((m) => (m.startsWith(`${p}:`) ? m : `${p}: ${m.replace(/^\w+:\s*/, '')}`))}
                >
                  {p}
                </button>
              ))}
            </div>
            <textarea
              placeholder="Commit message (Ctrl+Enter to commit)"
              value={message}
              rows={3}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.ctrlKey) doCommit();
              }}
            />
            <div className="git-commit-actions">
              <button className="btn-ghost small" onClick={aiMessage} disabled={busy} title="Generate with AI">
                <Sparkles size={13} /> AI
              </button>
              <button className="btn-primary small" onClick={doCommit} disabled={busy || !message.trim() || changes.length === 0}>
                <GitCommitHorizontal size={14} /> Commit
              </button>
            </div>
          </div>
          <div className="git-changes-header">
            Changes <span className="badge">{changes.length}</span>
          </div>
          <div className="git-changes">
            {changes.length === 0 && <div className="git-empty">No changes — working tree clean ✓</div>}
            {changes.map((c) => (
              <div key={c.path} className="git-change" onClick={() => openDiff(c.path)} title={`${c.path} — click to view diff`}>
                <span className="git-status" style={{ color: STATUS_COLORS[c.status] }}>
                  {c.status}
                </span>
                <span className="git-change-path">{c.path}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
