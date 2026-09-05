/**
 * Chat History Service — Realm DB compatible layer
 * Uses Electron file-based DB (userData/chat-history) via window.velo IPC
 * Mimics Realm API: create, read, update, delete, list
 * Each conversation is stored as JSON: { id, title, messages, mode, createdAt, updatedAt }
 */

import type { ChatMessage } from '../types';

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  mode: 'chat' | 'agent' | 'team' | 'dafb';
  createdAt: number;
  updatedAt: number;
}

const PREFIX = 'chat-history:';

function titleFromMessages(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser) return 'محادثة جديدة';
  const t = firstUser.content.slice(0, 50).replace(/\n/g, ' ');
  return t.length < firstUser.content.length ? t + '…' : t;
}

/** Save or update a conversation — Realm-like write */
export async function saveConversation(conv: Conversation): Promise<void> {
  const key = `${PREFIX}${conv.id}`;
  await window.velo.dbSave(key, conv);
}

/** Create new conversation from current messages */
export async function createConversation(messages: ChatMessage[], mode: 'chat' | 'agent' | 'team' | 'dafb'): Promise<Conversation> {
  const now = Date.now();
  const conv: Conversation = {
    id: `conv_${now}_${Math.random().toString(36).slice(2, 6)}`,
    title: titleFromMessages(messages),
    messages,
    mode,
    createdAt: now,
    updatedAt: now,
  };
  await saveConversation(conv);
  return conv;
}

/** Update existing conversation */
export async function updateConversation(id: string, messages: ChatMessage[], mode?: string): Promise<void> {
  const existing = await loadConversation(id);
  if (!existing) return;
  const updated: Conversation = {
    ...existing,
    messages,
    title: titleFromMessages(messages),
    mode: (mode as Conversation['mode']) || existing.mode,
    updatedAt: Date.now(),
  };
  await saveConversation(updated);
}

/** Load one conversation by id */
export async function loadConversation(id: string): Promise<Conversation | null> {
  const key = `${PREFIX}${id}`;
  const data = await window.velo.dbLoad(key);
  return (data as Conversation) || null;
}

/** List all conversations sorted by updatedAt desc */
export async function listConversations(): Promise<Conversation[]> {
  const all = await window.velo.dbList();
  const chats = all
    .filter((x) => x.key.startsWith(PREFIX))
    .sort((a, b) => b.ts - a.ts);
  const result: Conversation[] = [];
  for (const item of chats) {
    const conv = await window.velo.dbLoad(item.key);
    if (conv) result.push(conv as Conversation);
  }
  return result;
}

/** Delete conversation */
export async function deleteConversation(id: string): Promise<void> {
  const key = `${PREFIX}${id}`;
  await window.velo.dbDelete(key);
}

/** Auto-save current messages — called after each AI turn */
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let currentConvId: string | null = null;

export function setCurrentConversationId(id: string | null) {
  currentConvId = id;
}

export function getCurrentConversationId() {
  return currentConvId;
}

export function autoSave(messages: ChatMessage[], mode: 'chat' | 'agent' | 'team' | 'dafb') {
  if (messages.length === 0) return;
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    try {
      if (currentConvId) {
        await updateConversation(currentConvId, messages, mode);
      } else {
        const conv = await createConversation(messages, mode);
        currentConvId = conv.id;
      }
    } catch (e) {
      console.warn('autoSave failed', e);
    }
  }, 800);
}

export function clearCurrentConversation() {
  currentConvId = null;
}
