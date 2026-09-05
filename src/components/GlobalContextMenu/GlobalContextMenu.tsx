import { useEffect, useState } from 'react';
import { Copy, ClipboardPaste, TextSelect } from 'lucide-react';
import { useUIStore } from '../../store/useUIStore';

interface MenuState {
  x: number;
  y: number;
  hasSelection: boolean;
  inEditable: boolean;
  editableEl: HTMLElement | null;
}

/**
 * Global right-click menu — Electron has no native menu (frameless), so this
 * provides Copy/Paste/Select-All everywhere: chat, inputs, search results…
 * (Monaco editor and xterm terminal have their own menus.)
 */
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  // React 18 listens to 'input' for onChange — dispatch both for safety
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

async function pasteIntoElement(target: HTMLElement | null): Promise<void> {
  // Prefer the element that was right-clicked; fallback to activeElement
  let el = target as HTMLInputElement | HTMLTextAreaElement | null;
  if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA' && !el.isContentEditable)) {
    el = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
  }
  if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA' && !el.isContentEditable)) return;
  const text = await window.velo.clipboardRead();
  if (!text) return;
  if (el.isContentEditable) {
    const sel = window.getSelection();
    if (sel?.rangeCount) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(text));
      range.collapse(false);
    }
    return;
  }
  const start = el.selectionStart !== null ? el.selectionStart : el.value.length;
  const end = el.selectionEnd !== null ? el.selectionEnd : el.value.length;
  const newValue = el.value.slice(0, start) + text + el.value.slice(end);
  setNativeValue(el, newValue);
  el.setSelectionRange(start + text.length, start + text.length);
  el.focus();
  // Ensure React controlled textarea (AIChat) updates height
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function copyFromElement(target: HTMLElement | null): boolean {
  let el = target as HTMLInputElement | HTMLTextAreaElement | null;
  if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA')) {
    el = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
  }
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && el.selectionStart !== null) {
    const selected = el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0);
    if (selected) {
      void window.velo.clipboardWrite(selected);
      return true;
    }
    // If no selection inside input but input has value, copy all? fallback to selection
  }
  const sel = window.getSelection()?.toString();
  if (sel) {
    void window.velo.clipboardWrite(sel);
    return true;
  }
  return false;
}

function cutFromElement(target: HTMLElement | null): void {
  let el = target as HTMLInputElement | HTMLTextAreaElement | null;
  if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA')) {
    el = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
  }
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && el.selectionStart !== null) {
    const selected = el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0);
    if (!selected) return;
    void window.velo.clipboardWrite(selected);
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    setNativeValue(el, el.value.slice(0, start) + el.value.slice(end));
    el.setSelectionRange(start, start);
    el.focus();
    return;
  }
  const sel = window.getSelection()?.toString();
  if (sel) void window.velo.clipboardWrite(sel);
}

function clampPos(x: number, y: number, w = 210, h = 140): { x: number; y: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cx = Math.min(x, vw - w - 8);
  const cy = Math.min(y, vh - h - 8);
  return { x: Math.max(8, cx), y: Math.max(8, cy) };
}

export function GlobalContextMenu() {
  const [menu, setMenu] = useState<MenuState | null>(null);

  useEffect(() => {
    const onContext = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.monaco-editor') || target.closest('.xterm-instance')) return;
      e.preventDefault();

      // Find the actual editable that was right-clicked, not just activeElement
      const editableEl = target.closest('input, textarea, [contenteditable="true"]') as HTMLElement | null;
      const activeEl = document.activeElement as HTMLElement | null;
      const effectiveEditable = editableEl || (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable) ? activeEl : null);
      const inEditable = Boolean(effectiveEditable);

      // Has selection: check input selection or window selection
      let hasSelection = false;
      if (effectiveEditable && (effectiveEditable.tagName === 'INPUT' || effectiveEditable.tagName === 'TEXTAREA')) {
        const inp = effectiveEditable as HTMLInputElement;
        hasSelection = (inp.selectionStart ?? 0) !== (inp.selectionEnd ?? 0);
      }
      if (!hasSelection) {
        const sel = window.getSelection();
        hasSelection = Boolean(sel && sel.toString().trim());
      }

      // Also consider: if clicking inside textarea with no selection, still show Copy if there's selection elsewhere? keep as is
      setMenu({ x: e.clientX, y: e.clientY, hasSelection, inEditable, editableEl: effectiveEditable });
    };
    const onClick = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);

      const target = e.target as HTMLElement;
      const inSpecial = Boolean(target.closest('.monaco-editor') || target.closest('.xterm-instance'));
      const el = document.activeElement as HTMLElement | null;
      const inEditable = Boolean(
        el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      );

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
        const k = e.key.toLowerCase();
        if (k === 'c' && !inSpecial && !inEditable) {
          const sel = window.getSelection()?.toString();
          if (sel) void window.velo.clipboardWrite(sel);
        } else if (k === 'v' && inEditable && !inSpecial) {
          e.preventDefault();
          void pasteIntoElement(el);
        } else if (k === 'x' && inEditable && !inSpecial) {
          e.preventDefault();
          cutFromElement(el);
        } else if (k === 'a' && !inSpecial) {
          // Allow default Ctrl+A for inputs; for content, select chat if needed
          if (!inEditable) {
            const chat = document.querySelector('.ai-chat-messages');
            if (chat && window.getSelection()?.toString().trim() === '') {
              // Don't prevent default browser handling for now; menu already handles Select All
            }
          }
        }
      }
    };
    const onResize = () => setMenu(null);
    const onScroll = () => setMenu(null);
    window.addEventListener('contextmenu', onContext);
    window.addEventListener('click', onClick);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('contextmenu', onContext);
      window.removeEventListener('click', onClick);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, []);

  if (!menu) return null;

  const copySelection = () => {
    if (copyFromElement(menu.editableEl)) useUIStore.getState().showToast('Copied', 'success');
    setMenu(null);
  };

  const paste = () => {
    void pasteIntoElement(menu.editableEl);
    setMenu(null);
  };

  const selectAll = () => {
    const el = menu.editableEl as HTMLInputElement | HTMLTextAreaElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
      el.focus();
      el.select();
      // For React controlled, ensure selection is visible
      setTimeout(() => el.setSelectionRange(0, el.value.length), 0);
    } else {
      // Try to select the nearest scrollable text container
      const chat = document.querySelector('.ai-chat-messages');
      const searchResults = document.querySelector('.search-results');
      const target = chat || searchResults || document.body;
      const sel = window.getSelection();
      const range = document.createRange();
      try {
        range.selectNodeContents(target);
        sel?.removeAllRanges();
        sel?.addRange(range);
      } catch {}
    }
    setMenu(null);
  };

  const pos = clampPos(menu.x, menu.y);

  return (
    <div className="context-menu" style={{ left: pos.x, top: pos.y }} onMouseDown={(e) => e.stopPropagation()}>
      {menu.hasSelection && (
        <button className="context-menu-item" onClick={copySelection}>
          <Copy size={14} /> Copy
        </button>
      )}
      {menu.inEditable && (
        <button className="context-menu-item" onClick={paste}>
          <ClipboardPaste size={14} /> Paste
        </button>
      )}
      <button className="context-menu-item" onClick={selectAll}>
        <TextSelect size={14} /> Select All
      </button>
      {!menu.hasSelection && !menu.inEditable && (
        <button
          className="context-menu-item"
          onClick={() => {
            const chat = document.querySelector('.ai-chat-messages');
            if (chat) {
              const sel = window.getSelection();
              const range = document.createRange();
              range.selectNodeContents(chat);
              sel?.removeAllRanges();
              sel?.addRange(range);
            }
            setMenu(null);
          }}
        >
          <TextSelect size={14} /> Select Chat Text
        </button>
      )}
    </div>
  );
}
