import './services/capacitorShim';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';
import './styles/editor.css';

// Show loading and catch errors for mobile debugging
const rootEl = document.getElementById('root')!;
if (!rootEl.innerHTML) {
  rootEl.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#0b0e14;color:#8b9bb4;font-family:sans-serif;flex-direction:column;gap:12px"><div style="width:32px;height:32px;border:3px solid #1e293b;border-top-color:#3b82f6;border-radius:50%;animation:spin 1s linear infinite"></div><div>Loading Velo Mobile...</div><style>@keyframes spin{to{transform:rotate(360deg)}}</style></div>';
}

// Global error handler to avoid black screen on mobile
window.addEventListener('error', (e) => {
  console.error('Global error:', e.error || e.message);
  const el = document.getElementById('root');
  if (el) {
    const msg = (e.error?.stack || e.error?.message || e.message || String(e.error)).slice(0, 800);
    el.innerHTML = `<div style="padding:20px;background:#0b0e14;color:#f87171;font-family:monospace;white-space:pre-wrap;word-break:break-all"><h2 style="color:#f87171">Velo Mobile Error</h2><div style="color:#e2e8f0;margin:8px 0">${msg}</div><div style="color:#94a3b8;font-size:12px">Try clearing app data or reinstall. If persists, contact support.</div></div>`;
  }
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled rejection:', e.reason);
  const el = document.getElementById('root');
  if (el && !el.innerHTML.includes('Velo Mobile Error')) {
    const msg = String(e.reason?.stack || e.reason?.message || e.reason).slice(0, 800);
    el.innerHTML = `<div style="padding:20px;background:#0b0e14;color:#f87171;font-family:monospace;white-space:pre-wrap"><h2>Promise Error</h2><div>${msg}</div></div>`;
  }
});

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  componentDidCatch(error: any, info: any) {
    console.error('React error:', error, info);
  }
  render() {
    if (this.state.hasError) {
      const msg = String(this.state.error?.stack || this.state.error?.message || this.state.error).slice(0, 1000);
      return (
        <div style={{ padding: 20, background: '#0b0e14', color: '#f87171', fontFamily: 'monospace', whiteSpace: 'pre-wrap', minHeight: '100vh' }}>
          <h2>Velo Failed to Load</h2>
          <div style={{ color: '#e2e8f0', margin: '12px 0', fontSize: 13 }}>{msg}</div>
          <button onClick={() => location.reload()} style={{ padding: '8px 16px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 6, marginTop: 12 }}>Retry</button>
        </div>
      );
    }
    return this.props.children as any;
  }
}

try {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
} catch (err: any) {
  console.error('Mount error:', err);
  rootEl.innerHTML = `<div style="padding:20px;color:#f87171;background:#0b0e14;font-family:monospace">Mount failed: ${String(err?.stack || err).slice(0,800)}</div>`;
}
