import { useEffect } from 'react';
import { useUIStore } from '../../store/useUIStore';

export function ConfirmModal() {
  const { confirmState, resolveConfirm } = useUIStore();

  useEffect(() => {
    if (!confirmState) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') resolveConfirm(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [confirmState, resolveConfirm]);

  if (!confirmState) return null;

  return (
    <div className="modal-overlay" onMouseDown={() => resolveConfirm(null)}>
      <div className="modal confirm-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{confirmState.title}</h2>
        </div>
        <div className="confirm-body">{confirmState.message}</div>
        <div className="modal-footer">
          <button className="btn-ghost" onClick={() => resolveConfirm(null)}>
            Cancel
          </button>
          {confirmState.buttons.map((btn, i) => (
            <button
              key={btn}
              className={i === 0 ? 'btn-primary' : 'btn-ghost'}
              onClick={() => resolveConfirm(btn)}
            >
              {btn}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
