import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface FileRecord {
  path: string;
  action: 'created' | 'modified';
  timestamp: number;
}

export interface ChatMessagePersist {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  isStreaming?: boolean;
  modelUsed?: string;
  error?: string;
  createdFiles?: FileRecord[];
  timestamp: number;
}

interface ChatStoreState {
  messages: ChatMessagePersist[];
  isAgentRunning: boolean;
  currentTaskDescription: string | null;
  appendUserMessage: (content: string) => string;
  startAssistantMessage: (modelUsed?: string) => string;
  appendStreamChunk: (id: string, chunk: string) => void;
  attachCreatedFile: (id: string, file: FileRecord) => void;
  recordMessageError: (id: string, errorText: string) => void;
  finalizeMessage: (id: string) => void;
  setAgentRunning: (running: boolean, task?: string | null) => void;
  manualPurgeChat: () => void;
}

export const useChatStore = create<ChatStoreState>()(
  persist(
    (set) => ({
      messages: [],
      isAgentRunning: false,
      currentTaskDescription: null,

      appendUserMessage: (content) => {
        const id = crypto.randomUUID();
        set((state) => ({
          messages: [
            ...state.messages,
            { id, role: 'user', content, timestamp: Date.now() }
          ]
        }));
        return id;
      },

      startAssistantMessage: (modelUsed = 'gemini-3.6-flash') => {
        const id = crypto.randomUUID();
        set((state) => ({
          messages: [
            ...state.messages,
            {
              id,
              role: 'assistant',
              content: '',
              isStreaming: true,
              modelUsed,
              createdFiles: [],
              timestamp: Date.now()
            }
          ]
        }));
        return id;
      },

      appendStreamChunk: (id, chunk) =>
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === id ? { ...m, content: m.content + chunk } : m
          )
        })),

      attachCreatedFile: (id, file) =>
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === id
              ? { ...m, createdFiles: [...(m.createdFiles || []), file] }
              : m
          )
        })),

      recordMessageError: (id, errorText) =>
        set((state) => ({
          isAgentRunning: false,
          messages: state.messages.map((m) =>
            m.id === id
              ? { ...m, isStreaming: false, error: errorText }
              : m
          )
        })),

      finalizeMessage: (id) =>
        set((state) => ({
          isAgentRunning: false,
          messages: state.messages.map((m) =>
            m.id === id ? { ...m, isStreaming: false } : m
          )
        })),

      setAgentRunning: (running, task = null) =>
        set({ isAgentRunning: running, currentTaskDescription: task }),

      manualPurgeChat: () =>
        set({ messages: [], isAgentRunning: false, currentTaskDescription: null })
    }),
    {
      name: 'velo_persistent_chat_session',
      storage: createJSONStorage(() => localStorage)
    }
  )
);
