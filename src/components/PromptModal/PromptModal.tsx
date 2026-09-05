import { useEffect, useRef } from 'react';
import { useUIStore } from '../../store/useUIStore';

export function PromptModal() {
  const { promptState, resolvePrompt, setPromptValue } = useUIStore();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (promptState) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 30);
    }
  }, [promptState]);

  if (!promptState) return null;

  const confirm = () => {
    const v = promptState.value.trim();
    resolvePrompt(v || null);
  };

  return (
    <div className="modal-overlay" onMouseDown={() => resolvePrompt(null)}>
      <div className="modal prompt-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{promptState.title}</h2>
        </div>
        <div className="prompt-body">
          <input
            ref={inputRef}
            value={promptState.value}
            placeholder={promptState.placeholder}
            onChange={(e) => setPromptValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirm();
              if (e.key === 'Escape') resolvePrompt(null);
            }}
          />
        </div>
        <div className="modal-footer">
          <button className="btn-ghost" onClick={() => resolvePrompt(null)}>
            Cancel
          </button>
          <button className="btn-primary" onClick={confirm} disabled={!promptState.value.trim()}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
