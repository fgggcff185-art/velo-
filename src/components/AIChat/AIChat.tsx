import { useEffect, useRef, useState } from 'react';
import {
  Bot,
  User,
  Send,
  Square,
  Plus,
  Paperclip,
  Copy,
  ClipboardPaste,
  MessageSquare,
  Wand2,
  Users,
  Pencil,
  RotateCcw,
  FileCode2,
  TerminalSquare,
  FilePlus2,
  Trash2,
  ListTree,
  Check,
  AlertTriangle,
  History,
  Clock,
  Brain,
  X,
} from 'lucide-react';
import { useAIStore } from '../../store/useAIStore';
import { useUIStore } from '../../store/useUIStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { ModelSwitcher } from './ModelSwitcher';
import { Markdown } from './Markdown';
import { DAFBPanel } from './DAFBPanel';
import { useT, getDir } from '../../services/i18n';
import type { AgentStep, ChatMessage } from '../../types';

// Feature flags — hidden temporarily (set to true to re-enable)
const ENABLE_DAFB = false;
const ENABLE_DEEP_REASONING = false;

const TOOL_ICONS: Record<string, typeof FileCode2> = {
  read_file: FileCode2,
  write_file: FilePlus2,
  delete_file: Trash2,
  run_command: TerminalSquare,
  list_files: ListTree,
};

function StepItem({ step, onRevert }: { step: AgentStep; onRevert: () => void }) {
  const Icon = TOOL_ICONS[step.tool] || FileCode2;
  const target = String(step.input.path || step.input.command || '');
  const lines = step.output?.split('\n').length || 0;
  return (
    <div className={`agent-step ${step.status} ${step.reverted ? 'reverted' : ''}`}>
      <Icon size={13} />
      <span className="step-tool">{step.tool.replace('_', ' ')}</span>
      <span className="step-target" title={target}>
        {target.length > 44 ? target.slice(0, 44) + '…' : target}
      </span>
      {step.status === 'running' && <span className="spinner" />}
      {step.status === 'done' && <Check size={13} className="step-ok" />}
      {step.status === 'error' && <AlertTriangle size={13} className="step-err" />}
      {step.tool === 'write_file' && step.status === 'done' && !step.reverted && (
        <button className="btn-tiny revert" onClick={onRevert} title="Restore previous file content">
          <RotateCcw size={11} /> Revert
        </button>
      )}
      {step.reverted && <span className="step-reverted">reverted</span>}
      {step.status !== 'running' && lines > 1 && (
        <span className="step-lines" title={step.output}>
          {lines} lines
        </span>
      )}
    </div>
  );
}

function MessageBubble({
  msg,
  onRevert,
  onEdit,
}: {
  msg: ChatMessage;
  onRevert: (stepIndex: number) => void;
  onEdit?: (content: string) => void;
}) {
  const streaming = useAIStore((s) => s.streaming);
  if (msg.role === 'user') {
    return (
      <div className="chat-msg user">
        <div className="chat-msg-avatar user-avatar">
          <User size={14} />
        </div>
        <div className="chat-msg-body">
          {msg.attachments?.map((a) => (
            <div key={a.path} className="attachment-chip">
              <Paperclip size={11} /> {a.name}
            </div>
          ))}
          <div className="chat-msg-content user-content">{msg.content}</div>
          {onEdit && !streaming && (
            <button className="msg-edit-btn" title="Edit & resend this prompt" onClick={() => onEdit(msg.content)}>
              <Pencil size={11} /> Edit
            </button>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className={`chat-msg assistant ${msg.error ? 'error' : ''}`}>
      <div className="chat-msg-avatar ai-avatar">
        <Bot size={14} />
      </div>
      <div className="chat-msg-body">
        <button
          className="msg-copy-btn"
          title="Copy message"
          onClick={() => {
            void window.velo.clipboardWrite(msg.content);
            useUIStore.getState().showToast('Message copied', 'success');
          }}
        >
          <Copy size={12} />
        </button>
        {msg.steps && msg.steps.length > 0 && (
          <div className="agent-steps">
            {msg.steps.map((s, i) => (
              <StepItem key={i} step={s} onRevert={() => onRevert(i)} />
            ))}
          </div>
        )}
        <Markdown content={msg.content} />
        {msg.error && !streaming && (
          <button className="btn-tiny retry-btn" onClick={() => useAIStore.getState().retryLast()}>
            <RotateCcw size={11} /> Retry
          </button>
        )}
      </div>
    </div>
  );
}

export function AIChat() {
  const {
    messages,
    streaming,
    streamingContent,
    mode,
    attachments,
    conversations,
    currentConvId,
    deepReasoning,
    setMode,
    setDeepReasoning,
    send,
    abort,
    newChat,
    attachActiveFile,
    addAttachment,
    removeAttachment,
    revertStep,
    loadConversations,
    switchConversation,
    deleteConversation,
  } = useAIStore();
  const settings = useSettingsStore((s) => s.settings);
  const tr = useT();
  const [input, setInput] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, streamingContent, streaming]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  // Auto-fallback if DAFB is disabled but persisted mode is still 'dafb'
  useEffect(() => {
    if (!ENABLE_DAFB && mode === 'dafb') setMode('chat');
  }, [mode, setMode]);

  const handleHistoryToggle = () => {
    void loadConversations();
    setShowHistory((v) => !v);
  };

  const provider = settings.defaultProvider;
  const cfg = settings.providers[provider];
  const ready = provider === 'ollama' || Boolean(cfg?.apiKey);

  const handleSend = () => {
    if (streaming) return;
    const text = input.trim();
    if (!text) return;
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    if (mode === 'team') {
      void useAIStore.getState().runTeam(text);
    } else {
      void send(text);
    }
  };

  const lang = (settings as unknown as { language?: string }).language || 'ar';
  const dir = getDir(lang);
  return (
    <div
      className="ai-chat"
      dir={dir}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(e) => {
        e.preventDefault();
        void (async () => {
          for (const file of Array.from(e.dataTransfer.files).slice(0, 5)) {
            const path = window.velo.getPathForFile(file);
            if (!path) continue;
            const res = await window.velo.readFile(path);
            if (res.error || res.binary) {
              useUIStore.getState().showToast(`Skipped ${file.name} (binary or unreadable)`, 'error');
              continue;
            }
            addAttachment({ name: file.name, path, content: res.content.slice(0, 60000) });
            useUIStore.getState().showToast(`Attached ${file.name}`, 'success');
          }
        })();
      }}
    >
      <div className="ai-chat-header">
        <button
          onClick={() => useUIStore.getState().setAIPanel(false)}
          className="panel-action-btn"
          title="إغلاق الشات والعودة للمحرر"
          style={{ display: 'flex' }}
        >
          <X size={16} />
        </button>
        <div className="ai-mode-switch">
          <button className={mode === 'chat' ? 'active' : ''} onClick={() => setMode('chat')}>
            <MessageSquare size={13} /> {tr('chat')}
          </button>
          <button className={mode === 'agent' ? 'active' : ''} onClick={() => setMode('agent')}>
            <Wand2 size={13} /> {tr('agent')}
          </button>
          <button className={mode === 'team' ? 'active' : ''} onClick={() => setMode('team')} title="Architect → Coder → Reviewer pipeline">
            <Users size={13} /> {tr('team')}
          </button>
          {ENABLE_DAFB && (
            <button
              className={`dafb-btn ${mode === 'dafb' ? 'active' : ''}`}
              onClick={() => setMode('dafb')}
              title="DAFB — Data Analyst Football (ScoutAI Ultra)"
            >
              ⚽ DAFB
            </button>
          )}
        </div>
        <ModelSwitcher />
        <button className="panel-action-btn" onClick={handleHistoryToggle} title="سجل المحادثات — Realm DB">
          <History size={15} />
          {conversations.length > 0 && <span className="badge" style={{ marginLeft: 4 }}>{conversations.length}</span>}
        </button>
        <button className="panel-action-btn" onClick={newChat} title="New chat">
          <Plus size={15} />
        </button>
      </div>

      {showHistory && (
        <div style={{ borderBottom: '1px solid var(--border)', maxHeight: 220, overflowY: 'auto', background: 'var(--bg-2)' }}>
          <div style={{ padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: 0.8 }}>سجل المحادثات (Realm DB)</span>
            <button className="btn-ghost small" onClick={() => setShowHistory(false)}>إغلاق</button>
          </div>
          {conversations.length === 0 ? (
            <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>لا توجد محادثات محفوظة</div>
          ) : (
            conversations.slice(0, 20).map((conv) => (
              <div
                key={conv.id}
                onClick={() => {
                  void switchConversation(conv.id);
                  setShowHistory(false);
                }}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  borderTop: '1px solid var(--border)',
                  background: conv.id === currentConvId ? 'var(--bg-4)' : 'transparent',
                }}
                title={new Date(conv.updatedAt).toLocaleString('ar-EG')}
              >
                <Clock size={12} style={{ flexShrink: 0, color: 'var(--text-3)' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {conv.title}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)' }}>
                    {conv.mode} • {new Date(conv.updatedAt).toLocaleDateString('ar-EG')} • {conv.messages.length} رسائل
                  </div>
                </div>
                <button
                  className="icon-btn"
                  title="حذف المحادثة"
                  onClick={(e) => {
                    e.stopPropagation();
                    void deleteConversation(conv.id);
                  }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {ENABLE_DAFB && mode === 'dafb' ? (
        <DAFBPanel />
      ) : (
        <>
      <div className="ai-chat-messages" ref={scrollRef}>
        {messages.length === 0 && !streaming && (
          <div className="ai-empty">
            <Bot size={34} strokeWidth={1.4} />
            <h3>{mode === 'agent' ? tr('agentMode') : tr('chatWithVelo')}</h3>
            <p>
              {mode === 'agent'
                ? tr('chatEmptyAgent')
                : tr('chatEmptyChat')}
            </p>
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            msg={m}
            onRevert={(i) => revertStep(m.id, i)}
            onEdit={
              m.role === 'user'
                ? (content) => {
                    const remaining = useAIStore.getState().editMessage(m.id);
                    if (remaining === null) return;
                    setInput(remaining);
                    setTimeout(() => textareaRef.current?.focus(), 30);
                  }
                : undefined
            }
          />
        ))}
        {streaming && (
          <div className="chat-msg assistant">
            <div className="chat-msg-avatar ai-avatar">
              <Bot size={14} />
            </div>
            <div className="chat-msg-body">
              {streamingContent ? <Markdown content={streamingContent} /> : <span className="typing"><i /><i /><i /></span>}
            </div>
          </div>
        )}
      </div>

      {attachments.length > 0 && (
        <div className="ai-attachments">
          {attachments.map((a) => (
            <div key={a.path} className="attachment-chip">
              <Paperclip size={11} /> {a.name}
              <button onClick={() => removeAttachment(a.path)}>×</button>
            </div>
          ))}
        </div>
      )}

      <div className="ai-chat-input-wrap">
        <div className={`ai-chat-input ${ready ? '' : 'not-ready'}`}>
          <button
            className="icon-btn"
            title={tr('attachActiveFile')}
            onClick={attachActiveFile}
            disabled={streaming}
          >
            <Paperclip size={15} />
          </button>
          <button
            className="icon-btn"
            title={tr('attachFileFromDisk')}
            onClick={async () => {
              const p = await window.velo.openFileDialog();
              if (!p) return;
              const res = await window.velo.readFile(p);
              if (res.error) {
                useUIStore.getState().showToast(`Cannot read file: ${res.error}`, 'error');
                return;
              }
              addAttachment({
                name: p.split(/[\\/]/).pop() || p,
                path: p,
                content: res.binary ? '(binary file)' : res.content.slice(0, 60000),
              });
              useUIStore.getState().showToast('File attached', 'success');
            }}
            disabled={streaming}
          >
            <FilePlus2 size={15} />
          </button>
          <textarea
            ref={textareaRef}
            placeholder={
              !ready
                ? tr('notReadyHint')
                : mode === 'team'
                ? tr('teamHint')
                : mode === 'agent'
                ? tr('agentHint')
                : tr('chatHint')
            }
            value={input}
            rows={1}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px';
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          {ENABLE_DEEP_REASONING && (
            <button
              className={`icon-btn ${deepReasoning ? 'active' : ''}`}
              title={deepReasoning ? 'الاستدلال العميق مفعّل — لن يتوقف حتى يعمل المشروع بدون أخطاء' : 'تفعيل الاستدلال العميق — يكمل حتى تشغيل المشروع بنجاح'}
              onClick={() => setDeepReasoning(!deepReasoning)}
              disabled={streaming}
              style={{ color: deepReasoning ? 'var(--accent)' : undefined, background: deepReasoning ? 'var(--bg-4)' : undefined, border: deepReasoning ? '1px solid var(--accent)' : undefined }}
            >
              <Brain size={15} />
            </button>
          )}
          {streaming ? (
            <button className="send-btn stop" onClick={abort} title={tr('stop')}>
              <Square size={13} fill="currentColor" />
            </button>
          ) : (
            <button className="send-btn" onClick={handleSend} disabled={!input.trim() || !ready} title={tr('send')}>
              <Send size={14} />
            </button>
          )}
          <div className="input-mouse-actions" title="Copy / Paste with the mouse">
            <button
              className="icon-btn"
              title={tr('copyInput')}
              onClick={() => {
                if (input.trim()) {
                  void window.velo.clipboardWrite(input);
                  useUIStore.getState().showToast(tr('inputCopied'), 'success');
                }
              }}
            >
              <Copy size={14} />
            </button>
            <button
              className="icon-btn"
              title={tr('pasteInput')}
              onClick={async () => {
                const text = await window.velo.clipboardRead();
                if (!text) return;
                const el = textareaRef.current;
                if (!el) return;
                const start = el.selectionStart ?? input.length;
                const end = el.selectionEnd ?? input.length;
                const newValue = input.slice(0, start) + text + input.slice(end);
                setInput(newValue);
                setTimeout(() => {
                  el.focus();
                  el.setSelectionRange(start + text.length, start + text.length);
                }, 0);
              }}
            >
              <ClipboardPaste size={14} />
            </button>
          </div>
        </div>
        <div className="ai-chat-hint" dir={dir}>
          {deepReasoning && (mode === 'team' || mode === 'agent') ? (
            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{tr('deepReasoningHint')}</span>
          ) : mode === 'agent' ? (
            tr('agentCanDo')
          ) : mode === 'team' ? (
            tr('teamPipeline')
          ) : (
            tr('enterToSend')
          )}
        </div>
      </div>
        </>
      )}
    </div>
  );
}
