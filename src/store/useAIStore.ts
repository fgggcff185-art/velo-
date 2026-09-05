import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AgentStep, ChatAttachment, ChatMessage } from '../types';
import { streamChat, uid } from '../services/aiService';
import {
  AGENT_SYSTEM_PROMPT,
  CHAT_SYSTEM_PROMPT,
  buildAgentSystemPrompt,
  buildProjectContext,
  executeTool,
  parseToolCalls,
} from '../services/agentService';
import { relevantContextFor } from '../services/indexerService';
import { useSettingsStore } from './useSettingsStore';
import { useFileStore } from './useFileStore';
import { useEditorStore } from './useEditorStore';
import { useUIStore } from './useUIStore';
import * as chatHistory from '../services/chatHistoryService';
import * as checkpoint from '../services/checkpointService';
import { verifyProjectRuns } from '../services/verifyService';
import { LenientJsonParser } from '../utils/lenientJsonParser';
import { ContinuationEngine } from '../services/continuationEngine';
import { AgentOrchestrator } from '../services/agentOrchestrator';

const MAX_AGENT_ITERATIONS = 20;

function getLanguageInstruction(userContent?: string): string {
  const settingsLang = (useSettingsStore.getState().settings as unknown as { language?: string }).language || 'ar';
  const map: Record<string, { name: string; dir: string }> = {
    ar: { name: 'Arabic', dir: 'RTL (right-to-left)' },
    en: { name: 'English', dir: 'LTR' },
    fr: { name: 'French', dir: 'LTR' },
    de: { name: 'German', dir: 'LTR' },
    es: { name: 'Spanish', dir: 'LTR' },
  };
  let lang = settingsLang;
  if (userContent && /[\u0600-\u06FF]/.test(userContent)) lang = 'ar';
  else if (userContent && /[a-zA-Z]/.test(userContent) && !/[\u0600-\u06FF]/.test(userContent)) {
    // keep settings lang if user writes in Latin, but respect settings
  }
  const info = map[lang] || map[settingsLang] || map.ar;
  return `Reply in ${info.name}. Text direction: ${info.dir}. Always reply in the same language the user used in the last message. UI language is ${map[settingsLang].name}.`;
}

let activeStreamHandle: { abort: () => void } | null = null;

interface AIState {
  messages: ChatMessage[];
  streaming: boolean;
  streamingContent: string;
  mode: 'chat' | 'agent' | 'team' | 'dafb';
  attachments: ChatAttachment[];
  abortRequested: boolean;
  deepReasoning: boolean;
  conversations: import('../services/chatHistoryService').Conversation[];
  currentConvId: string | null;
  setMode: (mode: 'chat' | 'agent' | 'team' | 'dafb') => void;
  setDeepReasoning: (v: boolean) => void;
  addAttachment: (a: ChatAttachment) => void;
  removeAttachment: (path: string) => void;
  attachActiveFile: () => Promise<void>;
  newChat: () => void;
  abort: () => void;
  send: (text: string) => Promise<void>;
  askAI: (prompt: string) => Promise<void>;
  runTeam: (goal: string) => Promise<void>;
  editMessage: (messageId: string) => string | null;
  retryLast: () => Promise<void>;
  revertStep: (messageId: string, stepIndex: number) => Promise<void>;
  loadConversations: () => Promise<void>;
  switchConversation: (id: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
}

function historyForModel(): Array<{ role: 'user' | 'assistant'; content: string }> {
  const msgs = useAIStore.getState().messages.slice(-12);
  return msgs
    .filter((m) => !m.error)
    .map((m) => {
      let content =
        m.role === 'assistant' && m.steps?.length
          ? `${m.content}\n${m.steps
              .map((s) => `[tool ${s.tool} -> ${s.status}] ${s.output?.slice(0, 250) || ''}`)
              .join('\n')}`
          : m.content;
      // Truncate each history entry to 2200 chars to prevent token overflow (large projects)
      if (content.length > 2200) content = content.slice(0, 2200) + '\n...[truncated]';
      return { role: m.role, content };
    });
}

async function attachContentFor(attachments: ChatAttachment[]): Promise<string> {
  if (attachments.length === 0) return '';
  const parts: string[] = ['--- Attached file context ---'];
  for (const a of attachments) {
    parts.push(`File: ${a.path}\n\`\`\`\n${a.content.slice(0, 20000)}\n\`\`\``);
  }
  return parts.join('\n\n');
}

function isTruncatedToolResponse(text: string): boolean {
  const fences = (text.match(/```/g) || []).length;
  return fences % 2 === 1 && /```[ \t]*tool/i.test(text) && text.length > 7000;
}

async function runTurn(
  text: string,
  attachments: ChatAttachment[],
  set: SetFn,
  get: GetFn
): Promise<void> {
  const settings = useSettingsStore.getState().settings;
  const provider = settings.defaultProvider;
  const cfg = settings.providers[provider];
  if (provider !== 'ollama' && !cfg?.apiKey) {
    set((s) => ({
      messages: [
        ...s.messages,
        {
          id: uid(),
          role: 'assistant' as const,
          content: `**No API key configured for ${provider}.**\n\nOpen Settings (gear icon) and add your ${provider} API key, or switch provider/model from the selector above.`,
          ts: Date.now(),
          error: 'No API key configured',
        },
      ],
    }));
    set({ streaming: false, streamingContent: '' });
    return;
  }
  const attachmentCtx = await attachContentFor(attachments);
  const userContent = attachmentCtx ? `${attachmentCtx}\n\n---\n\n${text}` : text;
  try {
    if (get().mode === 'chat') {
      await runChatMode(userContent, set, get);
    } else {
      await runAgentMode(userContent, set, get);
    }
  } finally {
    activeStreamHandle = null;
    set({ streaming: false, streamingContent: '' });
  }
}

export const useAIStore = create<AIState>()(
  persist(
    (set, get) => ({
  messages: [],
  streaming: false,
  streamingContent: '',
  mode: 'chat',
  attachments: [],
  abortRequested: false,
  deepReasoning: false,
  conversations: [],
  currentConvId: null,

  setMode: (mode) => set({ mode }),
  setDeepReasoning: (v) => set({ deepReasoning: v }),

  addAttachment: (a) =>
    set((s) => ({
      attachments: s.attachments.some((x) => x.path === a.path) ? s.attachments : [...s.attachments, a],
    })),

  removeAttachment: (path) =>
    set((s) => ({ attachments: s.attachments.filter((a) => a.path !== path) })),

  attachActiveFile: async () => {
    const tab = useEditorStore.getState().activeTab();
    if (!tab || tab.kind !== 'file' || tab.binary) return;
    get().addAttachment({ name: tab.name, path: tab.path, content: tab.content });
  },

  newChat: () => {
    // Save current before clearing
    const { messages, mode } = get();
    if (messages.length > 0) {
      chatHistory.autoSave(messages, mode as 'chat' | 'agent' | 'team' | 'dafb');
    }
    chatHistory.clearCurrentConversation();
    activeStreamHandle?.abort();
    activeStreamHandle = null;
    set({ messages: [], streaming: false, streamingContent: '', attachments: [], abortRequested: true, currentConvId: null });
    setTimeout(() => set({ abortRequested: false }), 50);
  },

  abort: () => {
    activeStreamHandle?.abort();
    activeStreamHandle = null;
    set({ abortRequested: true, streaming: false, streamingContent: '' });
  },

  loadConversations: async () => {
    try {
      const list = await chatHistory.listConversations();
      set({ conversations: list });
    } catch {}
  },

  switchConversation: async (id: string) => {
    if (get().streaming) return;
    const conv = await chatHistory.loadConversation(id);
    if (!conv) return;
    chatHistory.setCurrentConversationId(id);
    set({ messages: conv.messages, mode: conv.mode, currentConvId: id });
  },

  deleteConversation: async (id: string) => {
    await chatHistory.deleteConversation(id);
    const list = await chatHistory.listConversations();
    set({ conversations: list });
    if (get().currentConvId === id) {
      chatHistory.clearCurrentConversation();
      set({ messages: [], currentConvId: null });
    }
  },

  send: async (text) => {
    const trimmed = text.trim();
    if (!trimmed || get().streaming) return;
    const attachments = get().attachments;
    const userMsg: ChatMessage = {
      id: uid(),
      role: 'user',
      content: trimmed,
      ts: Date.now(),
      attachments: attachments.length ? attachments : undefined,
    };
    set((s) => {
      const next = [...s.messages, userMsg];
      chatHistory.autoSave(next, s.mode as 'chat' | 'agent' | 'team' | 'dafb');
      return { messages: next, attachments: [], streaming: true, streamingContent: '', abortRequested: false };
    });
    await runTurn(trimmed, attachments, set, get);
    chatHistory.autoSave(get().messages, get().mode as 'chat' | 'agent' | 'team' | 'dafb');
    // refresh conversation list
    get().loadConversations().catch(() => undefined);
  },

  askAI: async (prompt) => {
    if (get().streaming) {
      useUIStore.getState().showToast('AI is busy — wait for the current response', 'error');
      return;
    }
    set({ mode: 'chat' });
    const userMsg: ChatMessage = { id: uid(), role: 'user', content: prompt, ts: Date.now() };
    set((s) => ({ messages: [...s.messages, userMsg], streaming: true, streamingContent: '', abortRequested: false }));
    useUIStore.getState().setAIPanel(true);
    await runTurn(prompt, [], set, get);
  },

  /** Load a sent prompt back into the composer for editing: removes it and everything after it. */
  editMessage: (messageId) => {
    if (get().streaming) {
      useUIStore.getState().showToast('Wait for the current response to finish first', 'error');
      return null;
    }
    const msgs = get().messages;
    const idx = msgs.findIndex((m) => m.id === messageId);
    if (idx === -1 || msgs[idx].role !== 'user') return null;
    const target = msgs[idx];
    set({ messages: msgs.slice(0, idx) });
    return target.content;
  },

  /**
   * Velo Agent Team — the unique multi-agent pipeline:
   * 🏛️ Architect (plans) → 👨‍💻 Coder (implements with tools) → 🔍 Reviewer (reviews the diff)
   * If the reviewer finds blocking issues, one fix round runs automatically.
   * FIXED: يحترم الملفات المرفقة، لا يعيد من الأول، ويضيف checkpoint
   */
  runTeam: async (goal) => {
    if (get().streaming) {
      useUIStore.getState().showToast('AI is busy — wait for the current response', 'error');
      return;
    }
    const trimmedGoal = goal.trim();
    if (!trimmedGoal) return;
    // Truncate helper to keep context within token limits for large projects
    const truncate = (s: string, max: number) => (s.length > max ? s.slice(0, max) + '\n...[truncated]' : s);
    const rawAttachments = get().attachments;
    const attachmentCtxRaw = await attachContentFor(rawAttachments);
    const attachmentCtx = truncate(attachmentCtxRaw, 12000);
    const goalWithContext = attachmentCtx ? `${attachmentCtx}\n\n---\n\n${trimmedGoal}` : trimmedGoal;
    useUIStore.getState().setAIPanel(true);
    set((s) => ({
      messages: [
        ...s.messages,
        { id: uid(), role: 'user' as const, content: `🎯 **Agent Team**: ${trimmedGoal}`, ts: Date.now(), attachments: rawAttachments.length ? rawAttachments : undefined },
      ],
      attachments: [],
      streaming: true,
      streamingContent: '',
      abortRequested: false,
    }));

    const finishMsg = (content: string, error?: string) => {
      if (get().abortRequested && error !== 'aborted') {
        // Don't add new messages after abort except the abort notice itself
        if (!content.includes('aborted') && !content.includes('stopped')) return;
      }
      set((s) => {
        const next = [...s.messages, { id: uid(), role: 'assistant' as const, content, ts: Date.now(), error }];
        // Immediate save (not debounced) to prevent loss on crash
        try { chatHistory.autoSave(next, 'team'); } catch {}
        return { messages: next };
      });
    };

    const getProviderCfg = () => {
      const s = useSettingsStore.getState().settings;
      return {
        provider: s.defaultProvider as Parameters<typeof streamChat>[0]['provider'],
        model: s.providers[s.defaultProvider]?.model || '',
      };
    };
    const fullProjectCtx = buildProjectContext();
    const projectCtx = truncate(fullProjectCtx, 8000);
    const restored = await checkpoint.loadTeamCheckpoint(trimmedGoal);
    const touchedFiles = restored?.touched || new Map<string, string>();
    let restoredPlan: string | null = restored?.plan || null;
    let restoredConvo: Array<{ role: string; content: string }> = restored?.convo || [];
    if ((restoredPlan || restoredConvo.length) && get().messages.length <= 3) finishMsg(`↩️ استعادة تقدم سابق — ${touchedFiles.size} ملف(ات) محفوظة، سيكمل من حيث توقف`);
    else if (restored && get().messages.length > 3) { restoredPlan = null; restoredConvo = []; }
    const saveTeamCheckpoint = (planVal: string, convoVal: Array<{ role: string; content: string }>) =>
      checkpoint.saveTeamCheckpoint(planVal, convoVal, touchedFiles, trimmedGoal);

    const chatOnce = async (system: string, user: string, maxTokens = 4096): Promise<string> => {
      const truncatedUser = truncate(user, 14000);
      const handle = streamChat(
        {
          ...getProviderCfg(),
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: truncatedUser },
          ],
          temperature: 0.4,
          maxTokens,
        },
        (chunk) => {
          if (!get().abortRequested) set((s) => ({ streamingContent: s.streamingContent + chunk }));
        },
        () => {}
      );
      activeStreamHandle = handle;
      const res = await handle.promise;
      set({ streamingContent: '' });
      activeStreamHandle = null;
      if (res.error) throw new Error(res.error);
      if (res.aborted) throw new Error('aborted');
      return res.full.trim();
    };

     try {
       let isLargeProject = trimmedGoal.length > 1500 || /POS|برنامج محاسبة|package\.json.*electron\.js|s/i.test(trimmedGoal);
       // ===== Phase 1: Architect =====
       let plan: string;
       let jsonPlan: Array<{ step: number; file: string; prompt: string }> | null = null;
       if (restoredPlan) {
         plan = restoredPlan;
         restoredPlan = null;
         try { const parsed = JSON.parse(plan); if (Array.isArray(parsed) && parsed[0]?.file) jsonPlan = parsed; } catch {}
       } else if (isLargeProject) {
         const jsonPlanRaw = await chatOnce(
           `You are the Architect for LARGE projects. Decompose the goal into a JSON array of steps, each step is ONE file. Example: [{"step":1,"file":"package.json","prompt":"Create package.json with React+TS+Electron+better-sqlite3"},{"step":2,"file":"electron.js","prompt":"Create Electron main process"}]. Max 12 steps. Output ONLY JSON, no markdown.\n\n${getLanguageInstruction(goalWithContext)}`,
           `${projectCtx}\n\nGoal: ${goalWithContext}`,
           3000
         );
         try {
           const cleaned = jsonPlanRaw.replace(/```json\n?|\n?```/g, '').trim();
           const parsed = JSON.parse(cleaned);
           if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].file) {
             jsonPlan = parsed;
             plan = JSON.stringify(jsonPlan, null, 2);
             finishMsg(`🏛️ **Architect — JSON Plan (${jsonPlan.length} steps)**\n\`\`\`json\n${plan.slice(0, 4000)}\n\`\`\``);
           } else throw new Error('invalid');
         } catch {
           plan = await chatOnce(
             `You are the Architect. Produce a SHORT plan: list files to create/modify and 3-6 steps. Max 200 words.\n\n${getLanguageInstruction(goalWithContext)}`,
             `${projectCtx}\n\nGoal: ${goalWithContext}`,
             2000
           );
         }
       } else {
         plan = await chatOnce(
           `You are the Architect in a senior engineering team. Produce a SHORT, concrete implementation plan for the goal: list the exact files to create/modify (paths) and 3-6 bullet steps. No code. Max 200 words.\n\n${getLanguageInstruction(goalWithContext)}`,
           `${projectCtx}${attachmentCtx ? `\n\nATTACHED FILES:\n${attachmentCtx}` : ''}\n\n---\n\nGoal: ${goalWithContext}`,
           2000
         );
       }
       if (!plan || plan.trim().length < 30) {
         try {
           const retryPlan = await chatOnce(
             `You are the Architect. The previous plan was empty/too short. Produce a concrete plan with exact file paths and 3-6 steps, 150-200 words, no code.\n\n${getLanguageInstruction(goalWithContext)}`,
             `${projectCtx}\n\nGoal: ${goalWithContext}`,
             2000
           );
          if (retryPlan && retryPlan.trim().length > 30) plan = retryPlan;
        } catch {}
      }
       if (!jsonPlan) finishMsg(`🏛️ **Architect — Plan**\n\n${plan}`);
      if (get().abortRequested) throw new Error('aborted');

      // ===== Phase 2: Coder — Step-by-Step for large projects, normal loop otherwise =====
      const safePlan = plan.replace(/```/g, '｀｀｀');
      const coderSystemBase = `${buildAgentSystemPrompt()}\n\nYou are the Coder on the team. Follow the Architect's plan exactly. Implement ALL files completely. Use write_file tool for EVERY file. Never just show code without tool. ${getLanguageInstruction(trimmedGoal)}\n\nARCHITECT PLAN:\n<plan>\n${safePlan}\n</plan>${attachmentCtx ? `\n\nATTACHED FILES TO CONSIDER:\n${attachmentCtx}` : ''}`;
      const coderSystem = coderSystemBase;
      let ragContextRaw = relevantContextFor(trimmedGoal, 5);
      ragContextRaw = truncate(ragContextRaw, 6000);
       const convo: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> =
         restoredConvo.length > 0
           ? (restoredConvo.map((m) => ({ role: m.role as 'system' | 'user' | 'assistant', content: m.content })) as Array<{ role: 'system' | 'user' | 'assistant'; content: string }>)
           : [
               { role: 'system', content: truncate(coderSystem, 12000) },
               { role: 'user', content: truncate(ragContextRaw ? `${ragContextRaw}\n\n---\n\n${goalWithContext}` : goalWithContext, 14000) },
             ];

      let coderSummary = '';
      let noToolNudges = 0;
      let pendingToolBuffer = '';
      if (jsonPlan && jsonPlan.length > 0) {
        // Step-by-Step Loop for large projects — one file per API call with 8192/24000 each
        for (let stepIdx = 0; stepIdx < jsonPlan.length; stepIdx++) {
          if (get().abortRequested) throw new Error('aborted');
          const step = jsonPlan[stepIdx];
          finishMsg(`🔨 Step ${step.step}/${jsonPlan.length}: ${step.file} — ${step.prompt.slice(0, 80)}...`);
          const stepConvo: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
            { role: 'system', content: truncate(coderSystem, 12000) },
            { role: 'user', content: `Create the file "${step.file}" now. Task: ${step.prompt}\n\nARCHITECT PLAN:\n${safePlan}\n\nAlready created: ${[...touchedFiles.keys()].slice(0, 15).join(', ') || 'none'}\n\nUse write_file tool ONLY for this file.` },
          ];
          set({ streamingContent: '' });
          const handle = streamChat(
            { ...getProviderCfg(), messages: stepConvo, temperature: 0.3, maxTokens: 24000 },
            (chunk) => { if (!get().abortRequested) set((s) => ({ streamingContent: s.streamingContent + chunk })); },
            () => {}
          );
          activeStreamHandle = handle;
          const res = await handle.promise;
          activeStreamHandle = null;
          set({ streamingContent: '' });
          if (get().abortRequested) throw new Error('aborted');
          if (res.aborted) throw new Error('aborted');
          if (res.error) {
            const isQuota = /quota|billing|credit|invalid model|does not exist|not found|\b402\b|\b404\b/i.test(res.error);
            finishMsg(`⚠️ Step ${step.step} ${isQuota ? 'quota' : 'error'}: ${res.error} — retry with next key`);
            const retryConvo = [...stepConvo, { role: 'assistant' as const, content: res.full || '' }, { role: 'user' as const, content: `Provider error: ${res.error}. Retry creating "${step.file}" NOW.` }];
            const retryHandle = streamChat({ ...getProviderCfg(), messages: retryConvo, temperature: 0.3, maxTokens: 24000 }, (c)=>{ if(!get().abortRequested) set((s)=>({streamingContent: s.streamingContent+c})); }, ()=>{});
            activeStreamHandle = retryHandle;
            const retryRes = await retryHandle.promise;
            activeStreamHandle = null; set({ streamingContent: '' });
            if (retryRes.error || retryRes.aborted) { finishMsg(`❌ Step ${step.step} failed: ${retryRes.error || 'aborted'}`); continue; }
            const retryParsed = parseToolCalls(retryRes.full);
            if (retryParsed.calls.length > 0) {
              for (const c of retryParsed.calls) {
                const { output, step: st } = await executeTool(c);
                if (c.tool === 'write_file' && st.targetPath) touchedFiles.set(st.targetPath, st.originalContent ?? '');
                finishMsg(`🔧 Step ${step.step}: [${c.tool}] ${output}`);
              }
              await saveTeamCheckpoint(plan, stepConvo as unknown as Array<{ role: string; content: string }>);
              try { (await import('../services/aiService')).useEngineStatus.getState(); } catch {}
              continue;
            }
          }
          let fullToParse = res.full;
          // Lenient stitching for large files
          if (isTruncatedToolResponse(res.full)) {
            const lenient = LenientJsonParser.extractWriteFile(res.full);
            if (lenient && lenient.isIncomplete) {
              try {
                const stitched = await ContinuationEngine.ensureFullFileContent(lenient.path, lenient.content, true);
                const fakeRaw = `{"tool":"write_file","path":"${lenient.path}","content":${JSON.stringify(stitched)}}`;
                const stitchedCalls = parseToolCalls(`\`\`\`tool\n${fakeRaw}\n\`\`\``);
                if (stitchedCalls.calls.length > 0) {
                  const { output, step: st } = await executeTool(stitchedCalls.calls[0]);
                  if (st.targetPath) touchedFiles.set(st.targetPath, st.originalContent ?? '');
                  finishMsg(`🔧 Stitched ${lenient.path}: ${output}`);
                  await AgentOrchestrator.handleAgentFileGeneration(fakeRaw, 'team-step-' + step.step);
                  await saveTeamCheckpoint(plan, stepConvo as unknown as Array<{ role: string; content: string }>);
                  continue;
                }
              } catch {}
            }
          }
          const { calls, cleanText } = parseToolCalls(fullToParse);
          if (calls.length === 0) {
            finishMsg(`⚠️ Step ${step.step} no tool: ${cleanText?.slice(0, 200) || res.full.slice(0, 200)} — will retry in next loop`);
            continue;
          }
          for (const c of calls) {
            const { output, step: st } = await executeTool(c);
            if (c.tool === 'write_file' && st.targetPath) touchedFiles.set(st.targetPath, st.originalContent ?? '');
            finishMsg(`🔧 Step ${step.step}: [${c.tool}] ${output}`);
          }
          coderSummary = cleanText || `Step ${step.step} done`;
          await saveTeamCheckpoint(plan, stepConvo as unknown as Array<{ role: string; content: string }>);
          // Silent key rotation for next step
          try { const { useSettingsStore } = await import('../store/useSettingsStore'); void useSettingsStore.getState(); } catch {}
        }
        // After step-by-step, skip normal loop
      } else {
        for (let iter = 0; iter < 15; iter++) {
        if (get().abortRequested) throw new Error('aborted');
        if (convo.length > 14) {
          const sys = convo[0];
          const recent = convo.slice(-10);
          const progress = [...touchedFiles.keys()].slice(0, 12).join(', ') || 'none';
          convo.splice(0, convo.length, sys, { role: 'user', content: `[Earlier ${convo.length - 11} exchanges omitted — already created: ${progress} — continue without recreating]` } as typeof sys, ...recent);
        }
        let totalChars = convo.reduce((a, m) => a + m.content.length, 0);
        while (totalChars > 30000 && convo.length > 4) {
          convo.splice(1, 1);
          totalChars = convo.reduce((a, m) => a + m.content.length, 0);
        }
        set({ streamingContent: '' });
        const handle = streamChat(
          { ...getProviderCfg(), messages: convo, temperature: 0.3, maxTokens: 24000 },
          (chunk) => {
            if (!get().abortRequested) set((s) => ({ streamingContent: s.streamingContent + chunk }));
          },
          () => set({ streamingContent: '' })
        );
        activeStreamHandle = handle;
        const res = await handle.promise;
        activeStreamHandle = null;
        set({ streamingContent: '' });
        if (get().abortRequested) throw new Error('aborted');
        if (res.aborted) throw new Error('aborted');
        if (res.error) {
          const isQuotaOrModel = /quota|billing|credit|invalid model|does not exist|not found|exceeded.*quota|\b402\b|\b404\b/i.test(res.error);
          const progress = [...touchedFiles.keys()].slice(0, 12).join(', ') || 'none';
          if (isQuotaOrModel) {
            finishMsg(`⚠️ Coder iteration ${iter + 1} quota/model error: ${res.error} — تم حفظ التقدم (${touchedFiles.size} ملف: ${progress}) سيتم المحاولة بموديل free آخر`);
            convo.push({ role: 'user', content: `Previous provider failed (quota/model): ${res.error}. Already created files: ${progress}. Do NOT recreate them. Continue with remaining files from the plan using the next available model.` });
            await saveTeamCheckpoint(plan, convo);
            await new Promise((r) => setTimeout(r, 2000));
            iter--;
            if (iter < -2) break;
            continue;
          }
          finishMsg(`⚠️ Coder iteration ${iter + 1} error: ${res.error} — سيتم التبديل تلقائياً والمحاولة مرة أخرى (الملفات المحفوظة: ${progress})`);
          convo.push({ role: 'user', content: `Provider error: ${res.error}. Already created: ${progress}. Continue WITHOUT restarting, only create missing files from the plan.` });
          await saveTeamCheckpoint(plan, convo);
          await new Promise((r) => setTimeout(r, 1500));
          iter--;
          continue;
        }
        // Handle truncated tool accumulation — combine pending buffer with current chunk
        let fullToParse = res.full;
        if (pendingToolBuffer) {
          fullToParse = pendingToolBuffer + res.full;
          pendingToolBuffer = '';
        }
        if (isTruncatedToolResponse(res.full)) {
          const lenient = LenientJsonParser.extractWriteFile(res.full);
          if (lenient && lenient.isIncomplete) {
            const stitched = await ContinuationEngine.ensureFullFileContent(lenient.path, lenient.content, true);
            const fakeRaw = `{"tool":"write_file","path":"${lenient.path}","content":${JSON.stringify(stitched)}}`;
            const stitchedCalls = parseToolCalls(`\`\`\`tool\n${fakeRaw}\n\`\`\``);
            if (stitchedCalls.calls.length > 0) {
              const { output, step } = await executeTool(stitchedCalls.calls[0]);
              if (step.targetPath) touchedFiles.set(step.targetPath, step.originalContent ?? '');
              finishMsg(`🔧 Stitched truncated file ${lenient.path}: ${output}`);
              await AgentOrchestrator.handleAgentFileGeneration(fakeRaw, 'team-stitch-' + Date.now());
              convo.push({ role: 'assistant', content: res.full });
              convo.push({ role: 'user', content: `TOOL RESULTS:\n[tool stitch] ${output}\n\nContinue with the plan.` });
              await saveTeamCheckpoint(plan, convo);
              continue;
            }
          }
          pendingToolBuffer = res.full;
          convo.push({ role: 'assistant', content: res.full });
          convo.push({
            role: 'user',
            content: 'Your last tool block was TRUNCATED (hit token limit). Continue EXACTLY the same write_file JSON — continue the "content" string from where you stopped, then close the JSON and the ``` fence. Do NOT restart the file, just continue.',
          });
          continue;
        }
        const { calls, cleanText } = parseToolCalls(fullToParse);
        if (calls.length === 0) {
          if (cleanText && /```/.test(cleanText) && noToolNudges < 2) {
            noToolNudges++;
            const nudge =
              noToolNudges === 1
                ? 'Your reply contained code but NO write_file tool — THIS IS A FAILURE. You MUST emit tool blocks like:\n```tool\n{"tool":"write_file","path":"src/file.ts","content":"FULL FILE CONTENT"}\n```\nRewrite ALL files from the plan NOW using write_file tools only. Do NOT show code without tool.'
                : 'FINAL: STILL NO TOOL BLOCKS — you are showing code in chat. EMIT write_file blocks NOW for every file in the plan. One block per file, or task fails.';
            convo.push({ role: 'assistant', content: res.full });
            convo.push({ role: 'user', content: nudge });
            continue;
          }
          if (noToolNudges >= 2 && cleanText && /```/.test(cleanText)) {
            const blocks = [...cleanText.matchAll(/```\w*\n([\s\S]*?)```/g)];
            if (blocks.length > 0) {
              finishMsg(`⚠️ **Coder Warning** — No tool blocks after 2 nudges, auto-saving ${blocks.length} code blocks...`);
              for (let bi = 0; bi < Math.min(blocks.length, 5); bi++) {
                const code = blocks[bi][1];
                if (code.trim().length < 40) continue;
                const inferred = `src/auto-${Date.now()}-${bi}.ts`;
                try {
                  const { output } = await executeTool({ tool: 'write_file', input: { path: inferred, content: code } });
                  touchedFiles.set(inferred, '');
                  finishMsg(`🔧 Auto-saved block ${bi + 1} to ${inferred}: ${output}`);
                } catch {}
              }
            }
          }
          coderSummary = cleanText || res.full || 'Coder finished (no summary)';
          break;
        }
        noToolNudges = 0;
        const steps: AgentStep[] = calls.map((c) => ({ tool: c.tool, input: c.input, status: 'running' as const }));
        const msgId = uid();
        set((s) => ({
          messages: [
            ...s.messages,
            {
              id: msgId,
              role: 'assistant' as const,
              content: cleanText || '👨‍💻 Coder working…',
              ts: Date.now(),
              steps,
            },
          ],
        }));
        const results: string[] = [];
        for (let i = 0; i < calls.length; i++) {
          if (get().abortRequested) throw new Error('aborted');
          const { output, step } = await executeTool(calls[i]);
          if (calls[i].tool === 'write_file' && step.targetPath) {
            if (!touchedFiles.has(step.targetPath)) {
              touchedFiles.set(step.targetPath, step.originalContent ?? '');
            }
          }
          results.push(`[tool ${i + 1}: ${calls[i].tool}] ${output}`);
          set((s) => ({
            messages: s.messages.map((m) =>
              m.id === msgId && m.steps
                ? { ...m, steps: m.steps.map((st, idx) => (idx === i ? { ...step, reverted: st.reverted } : st)) }
                : m
            ),
          }));
        }
         await saveTeamCheckpoint(plan, convo);
         // Use fullToParse (may be buffered) for convo to keep token-accurate history
         convo.push({ role: 'assistant', content: fullToParse });
        convo.push({
          role: 'user',
          content: `TOOL RESULTS:\n${results.join('\n\n')}\n\nContinue with the plan. If complete, summarize (no tool block).`,
        });
        coderSummary = cleanText || fullToParse.slice(0, 500) || 'Applied changes.';
        // Persist checkpoint after each iteration
        chatHistory.autoSave(get().messages, 'team');
      }
      // Strong retry if still no files — up to 2 attempts with escalating instruction
      if (touchedFiles.size === 0) {
        for (let retry = 0; retry < 2 && touchedFiles.size === 0; retry++) {
          finishMsg(`⚠️ **Coder Warning** — No files were created (attempt ${retry + 1}/2). Retrying with explicit instruction…`);
          const retryHandle = streamChat(
            {
              ...getProviderCfg(),
              messages: [
                ...convo,
                {
                  role: 'user',
                  content:
                    retry === 0
                      ? 'You produced NO files. You MUST use write_file tool blocks NOW. Example:\n```tool\n{"tool":"write_file","path":"src/example.ts","content":"FULL FILE CONTENT"}\n```\nCreate ALL files from the plan immediately using write_file.'
                      : 'CRITICAL: STILL NO FILES. Emit ONE write_file tool block PER FILE from the plan. Content must be COMPLETE file, no placeholders like "...rest". Example for each file:\n```tool\n{"tool":"write_file","path":"src/app.ts","content":"import ...\\nFULL CODE"}\n```\nDo it NOW.',
                },
              ],
              temperature: 0.3,
              maxTokens: 16384,
            },
            (chunk) => {
              if (!get().abortRequested) set((s) => ({ streamingContent: s.streamingContent + chunk }));
            },
            () => set({ streamingContent: '' })
          );
          activeStreamHandle = retryHandle;
          const retryRes = await retryHandle.promise;
          activeStreamHandle = null;
          set({ streamingContent: '' });
          if (retryRes.error || retryRes.aborted) break;
          const { calls: retryCalls } = parseToolCalls(retryRes.full);
          if (retryCalls.length === 0) continue;
          for (const c of retryCalls) {
            const { output, step } = await executeTool(c);
            if (c.tool === 'write_file' && step.targetPath) touchedFiles.set(step.targetPath, step.originalContent ?? '');
            finishMsg(`🔧 Retry: [${c.tool}] ${output}`);
          }
          if (retryCalls.length > 0) {
            coderSummary = 'Files created on retry.';
          }
        }
      }
      } // close else (normal loop) — for jsonPlan, touchedList already handled in step-by-step
      const touchedList = [...touchedFiles.keys()];
      const touchedDisplay = touchedList.length > 15 ? `${touchedList.slice(0, 15).join(', ')} +${touchedList.length - 15} more` : touchedList.join(', ') || 'none';
      if (!jsonPlan) finishMsg(`👨‍💻 **Coder — Done**\n\n${truncate(coderSummary || 'Implementation complete.', 800)}\n\nFiles touched: ${touchedDisplay}`);
      else finishMsg(`👨‍💻 **Coder — Done (Step-by-Step ${jsonPlan.length} steps)**\n\nFiles touched: ${touchedDisplay}`);

      // ===== Phase 3: Reviewer =====
      const diffs: string[] = [];
      let idx = 0;
      for (const [path, original] of touchedFiles) {
        if (idx++ >= 12) {
          diffs.push(`... +${touchedFiles.size - 12} more files omitted for review`);
          break;
        }
        try {
          const res = await window.velo.readFile(path);
          const modified = res.binary ? '' : res.content;
          const origLines = original.split('\n');
          const modLines = modified.split('\n');
          diffs.push(
            `File: ${path}\n- lines: ${origLines.length} → ${modLines.length}\n--- NEW CONTENT (first 80 lines) ---\n${modLines.slice(0, 80).join('\n')}`
          );
        } catch {
          diffs.push(`File: ${path} — could not read`);
        }
      }
      let review = '✅ APPROVED — No files to review (skipped)';
      if (diffs.length > 0) {
        review = await chatOnce(
          `You are the senior Reviewer on the team. Review the changes against the plan. Reply with either:\n"✅ APPROVED — <one-line summary>" or\n"❌ CHANGES REQUIRED — <numbered list of blocking issues>". Be strict but practical. Max 150 words.\n\n${getLanguageInstruction(plan)}`,
          `PLAN:\n${plan}\n\nCHANGES:\n${diffs.join('\n\n').slice(0, 12000)}`,
          1500
        );
      }
      finishMsg(`🔍 **Reviewer — Verdict**\n\n${review}`);

      if (/❌|CHANGES REQUIRED/i.test(review) && !get().abortRequested && touchedFiles.size > 0) {
        finishMsg(`🔄 **Fix Round** — sending reviewer feedback to the Coder…`);
        const fixSystem = `${buildAgentSystemPrompt()}\n\nYou are the Coder. The Reviewer rejected your work. Fix EXACTLY the listed issues. ${getLanguageInstruction(review)}\n\nREVIEWER ISSUES:\n${review}\n\nORIGINAL PLAN:\n${plan}`;
        const fixConvo: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
          { role: 'system', content: fixSystem },
          { role: 'user', content: 'Fix all the reviewer issues now.' },
        ];
        for (let iter = 0; iter < 8; iter++) {
          if (get().abortRequested) throw new Error('aborted');
          set({ streamingContent: '' });
          const handle = streamChat(
            { ...getProviderCfg(), messages: fixConvo, temperature: 0.3, maxTokens: 16384 },
            (chunk) => {
              if (!get().abortRequested) set((s) => ({ streamingContent: s.streamingContent + chunk }));
            },
            () => set({ streamingContent: '' })
          );
          activeStreamHandle = handle;
          const res = await handle.promise;
          activeStreamHandle = null;
          set({ streamingContent: '' });
          if (get().abortRequested) throw new Error('aborted');
          if (res.aborted) throw new Error('aborted');
          if (res.error) {
            const fixProgress = [...touchedFiles.keys()].slice(0, 8).join(', ') || 'none';
            finishMsg(`⚠️ Fix round error: ${res.error} — سيتم إعادة المحاولة بدون إعادة بداية (المحفوظ: ${fixProgress})`);
            fixConvo.push({ role: 'user', content: `Fix round provider error: ${res.error}. Already fixed: ${fixProgress}. Continue fixing without restarting.` });
            await saveTeamCheckpoint(plan, convo);
            await new Promise((r) => setTimeout(r, 1500));
            iter--;
            continue;
          }
          if (isTruncatedToolResponse(res.full)) {
            fixConvo.push({ role: 'assistant', content: res.full });
            fixConvo.push({ role: 'user', content: 'Tool block truncated — continue the same JSON content to completion.' });
            continue;
          }
          const { calls, cleanText } = parseToolCalls(res.full);
          if (calls.length === 0) {
            finishMsg(`👨‍💻 **Coder — Fixes Applied**\n\n${cleanText || res.full}`);
            break;
          }
          const steps: AgentStep[] = calls.map((c) => ({ tool: c.tool, input: c.input, status: 'running' as const }));
          const msgId = uid();
          set((s) => ({
            messages: [
              ...s.messages,
              { id: msgId, role: 'assistant' as const, content: cleanText || '👨‍💻 Fixing…', ts: Date.now(), steps },
            ],
          }));
          const results: string[] = [];
          for (let i = 0; i < calls.length; i++) {
            if (get().abortRequested) throw new Error('aborted');
            const { output, step } = await executeTool(calls[i]);
            if (calls[i].tool === 'write_file' && step.targetPath && !touchedFiles.has(step.targetPath)) {
              touchedFiles.set(step.targetPath, step.originalContent ?? '');
            }
            results.push(`[tool ${i + 1}: ${calls[i].tool}] ${output}`);
            set((s) => ({
              messages: s.messages.map((m) =>
                m.id === msgId && m.steps
                  ? { ...m, steps: m.steps.map((st, idx) => (idx === i ? { ...step, reverted: st.reverted } : st)) }
                  : m
              ),
            }));
          }
          fixConvo.push({ role: 'assistant', content: res.full });
          fixConvo.push({
            role: 'user',
            content: `TOOL RESULTS:\n${results.join('\n\n')}\n\nIf all issues are fixed, summarize (no tool block).`,
          });
        }
      }
       finishMsg(`🎯 **Agent Team finished** — ${touchedFiles.size} file(s) changed. Review the steps above; each write has a Revert button.`);

        // ===== Deep Reasoning: keep running until project actually runs without errors =====
        let deepVerifyOk = false;
        if (get().deepReasoning && !get().abortRequested && touchedFiles.size > 0) {
          deepVerifyOk = false;
          for (let deep = 0; deep < 3; deep++) {
            if (get().abortRequested) break;
            finishMsg(`🧠 **الاستدلال العميق — فحص تشغيل المشروع (${deep + 1}/3)...**`);
            const verify = await verifyProjectRuns();
            if (verify.ok) {
              finishMsg(`✅ **الاستدلال العميق — المشروع يعمل بدون أخطاء** (${verify.cmd})\n\`\`\`\n${verify.log.slice(0, 3000)}\n\`\`\``);
              deepVerifyOk = true;
              break;
            }
            // Only auto-fix if error mentions files we touched (avoid fixing unrelated pre-existing errors)
            const touchedList = [...touchedFiles.keys()];
            const isRelevant = touchedList.some((p) => verify.log.includes(p.split(/[\\/]/).pop() || '')) || /error/i.test(verify.log.slice(0, 2000));
            if (!isRelevant) {
              finishMsg(`⚠️ فشل التشغيل لكن الخطأ غير مرتبط بالملفات التي تم إنشاؤها — سيتم الإيقاف بدون إصلاح تلقائي\n\`\`\`\n${verify.log.slice(0, 2000)}\n\`\`\``);
              break;
            }
            finishMsg(`❌ فشل التشغيل (${verify.cmd}):\n\`\`\`\n${verify.log.slice(0, 3800)}\n\`\`\`\nسيتم إصلاح الأخطاء تلقائياً...`);
            const deepFixSystem = `${buildAgentSystemPrompt()}\n\n${getLanguageInstruction(verify.log)}\n\nأنت المبرمج المسؤول عن إصلاح أخطاء التشغيل. المشروع فشل عند تنفيذ: ${verify.cmd}\n\nسجل الخطأ:\n${verify.log.slice(0, 6000)}\n\nأصلح الملفات المطلوبة فقط، استخدم write_file.`;
            const deepConvo: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
              { role: 'system', content: truncate(deepFixSystem, 11000) },
              { role: 'user', content: `أصلح أخطاء التشغيل التالية، ثم تأكد أن المشروع يعمل:\n${verify.log.slice(0, 4000)}\n\nالخطة الأصلية:\n${plan}\n\nالملفات التي تم لمسها: ${touchedList.slice(0, 15).join(', ')}` },
            ];
            let fixed = false;
            for (let iter = 0; iter < 3; iter++) {
              if (get().abortRequested) break;
              set({ streamingContent: '' });
              const handle = streamChat(
                { ...getProviderCfg(), messages: deepConvo, temperature: 0.3, maxTokens: 16384 },
                (chunk) => { if (!get().abortRequested) set((s) => ({ streamingContent: s.streamingContent + chunk })); },
                () => set({ streamingContent: '' })
              );
              activeStreamHandle = handle;
              const res = await handle.promise;
              activeStreamHandle = null;
              set({ streamingContent: '' });
              if (get().abortRequested || res.aborted) break;
              if (res.error) {
                finishMsg(`⚠️ إصلاح فشل: ${res.error} — سيتم المحاولة بموزع آخر`);
                deepConvo.push({ role: 'user', content: `Provider error: ${res.error}. Continue fixing.` });
                await saveTeamCheckpoint(plan, convo);
                continue;
              }
              const { calls, cleanText } = parseToolCalls(res.full);
              if (calls.length === 0) { finishMsg(cleanText || res.full || 'لا يوجد إصلاح'); break; }
              const results: string[] = [];
              for (let i = 0; i < calls.length; i++) {
                if (get().abortRequested) break;
                const { output, step } = await executeTool(calls[i]);
                if (calls[i].tool === 'write_file' && step.targetPath) touchedFiles.set(step.targetPath, step.originalContent ?? '');
                results.push(`[${calls[i].tool}] ${output}`);
              }
              finishMsg(`🔧 إصلاح ${calls.length} ملف(ات): ${results.join(' | ').slice(0, 600)}`);
              deepConvo.push({ role: 'assistant', content: res.full });
              deepConvo.push({ role: 'user', content: `TOOL RESULTS:\n${results.join('\n\n')}\n\nإذا انتهى الإصلاح أرسل ملخص بدون tool.` });
              await saveTeamCheckpoint(plan, convo);
              fixed = true;
              break;
            }
            if (!fixed) break;
            if (deep === 2) finishMsg(`⚠️ الاستدلال العميق — انتهت محاولات الإصلاح، راجع السجل أعلاه`);
          }
        }
        if (!get().deepReasoning || deepVerifyOk || get().abortRequested) {
          try { await checkpoint.clearTeamCheckpoint(); } catch {}
        } else {
          await saveTeamCheckpoint(plan, convo);
        }
     } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message !== 'aborted') finishMsg(`⚠️ Agent Team stopped: ${message}`, message);
    } finally {
      // ✅ FIX: always stop the spinner, even on success, error or abort
      activeStreamHandle = null;
      set({ streaming: false, streamingContent: '', abortRequested: false });
      // persist final state and refresh conversation list
      try {
        chatHistory.autoSave(get().messages, 'team');
        get().loadConversations().catch(() => undefined);
      } catch {}
    }
  },

  retryLast: async () => {
    if (get().streaming) return;
    const msgs = get().messages;
    let lastUserIdx = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx === -1) return;
    const lastUser = msgs[lastUserIdx];
    set({
      messages: msgs.slice(0, lastUserIdx + 1),
      streaming: true,
      streamingContent: '',
      abortRequested: false,
    });
    await runTurn(lastUser.content, lastUser.attachments || [], set, get);
  },

  revertStep: async (messageId, stepIndex) => {
    const msg = get().messages.find((m) => m.id === messageId);
    if (!msg?.steps) return;
    const step = msg.steps[stepIndex];
    if (!step || step.tool !== 'write_file' || !step.targetPath) return;
    await window.velo.writeFile(step.targetPath, step.originalContent ?? '');
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === messageId
          ? {
              ...m,
              steps: m.steps?.map((st, i) => (i === stepIndex ? { ...st, reverted: true } : st)),
            }
          : m
      ),
    }));
    const tab = useEditorStore.getState().tabs.find((t) => t.path === step.targetPath);
    if (tab && !tab.dirty) await useEditorStore.getState().reloadTabFromDisk(step.targetPath);
    await useFileStore.getState().refresh();
  },
    }),
    {
      name: 'velo_ai_persist',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ messages: state.messages, deepReasoning: state.deepReasoning }) as unknown as AIState,
    }
  )
);

type SetFn = (partial: Partial<AIState> | ((s: AIState) => Partial<AIState>)) => void;
type GetFn = () => AIState;

async function runChatMode(userContent: string, set: SetFn, get: GetFn): Promise<void> {
  const getProviderCfg = () => {
    const s = useSettingsStore.getState().settings;
    return {
      provider: s.defaultProvider as Parameters<typeof streamChat>[0]['provider'],
      model: s.providers[s.defaultProvider]?.model || '',
    };
  };
  const truncate = (s: string, max: number) => (s.length > max ? s.slice(0, max) + '\n...[truncated for token limit]' : s);
  // For large projects, limit RAG and project context to avoid token overflow
  let ragContext = relevantContextFor(userContent, 4);
  ragContext = truncate(ragContext, 5000);
  let projectCtx = buildProjectContext();
  projectCtx = truncate(projectCtx, 7000);
  const system = `${CHAT_SYSTEM_PROMPT}\n\n${projectCtx}${ragContext ? `\n\n${ragContext}` : ''}\n\n${getLanguageInstruction(userContent)}`;
  const systemTrunc = truncate(system, 11000);
  const history = historyForModel();
  // Truncate each history entry to 2500 chars to fit large conversations
  const truncatedHistory = history.slice(0, -1).map((h) => ({ ...h, content: truncate(h.content, 2500) }));
  let messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system' as const, content: systemTrunc },
    ...truncatedHistory,
    { role: 'user' as const, content: truncate(userContent, 12000) },
  ];
  let full = '';
  // Auto-continue loop for long responses — don't make user resend (FR: حل التوقف + المشاريع الكبيرة)
  for (let cont = 0; cont < 4; cont++) {
    const handle = streamChat(
       { provider: getProviderCfg().provider, model: getProviderCfg().model, messages, temperature: 0.6, maxTokens: 16384 },
      (chunk) => {
        if (!get().abortRequested) set((s) => ({ streamingContent: s.streamingContent + chunk }));
      },
      () => set({ streamingContent: '' })
    );
    activeStreamHandle = handle;
    const res = await handle.promise;
    activeStreamHandle = null;
    set({ streamingContent: '' });
    if (get().abortRequested || res.aborted) return;
    if (res.error) {
      // Handle token limit error by shrinking context and retrying same turn without losing progress
      if (/token|context|too large|maximum|too many/i.test(res.error) && cont < 2) {
        const smallerRag = truncate(ragContext, 2000);
        const smallerProj = truncate(projectCtx, 3000);
        const smallerSystem = truncate(`${CHAT_SYSTEM_PROMPT}\n\n${smallerProj}${smallerRag ? `\n\n${smallerRag}` : ''}`, 6000);
        messages[0] = { role: 'system', content: smallerSystem };
        // also shrink user content
        messages[messages.length - 1] = { role: 'user', content: truncate(userContent, 6000) };
        set({ streamingContent: '' });
        continue;
      }
      set((s) => {
        const next = [
          ...s.messages,
          {
            id: uid(),
            role: 'assistant' as const,
            content: `⚠️ ${res.error}`,
            ts: Date.now(),
            provider: getProviderCfg().provider,
            model: getProviderCfg().model,
            error: res.error,
          },
        ];
        import('../services/chatHistoryService').then((m) => m.autoSave(next, s.mode as 'chat' | 'agent' | 'team' | 'dafb'));
        return { messages: next };
      });
      return;
    }
    full += res.full;
    // Robust truncated detection: unclosed fences, length near maxTokens, or ending mid-sentence
    const lastContent = res.full.trim();
    const truncated = res.full.length > 12000 && !/([.!?`}\n]|```)\s*$/.test(lastContent);
    const hasUnclosedBlock = (full.match(/```/g) || []).length % 2 === 1;
    const hasUnclosedTag = lastContent.includes('<') && !lastContent.includes('>') && lastContent.length > 5000;
    const looksCut = truncated || hasUnclosedBlock || hasUnclosedTag || res.full.length > 15500;
    if (looksCut && cont < 3) {
      messages = [...messages, { role: 'assistant' as const, content: res.full }, { role: 'user' as const, content: 'Continue from where you stopped — complete the response without repeating. Keep same language and formatting.' }];
      // keep streamingContent accumulating for UI? We'll reset and let next chunk append
      set({ streamingContent: full });
      continue;
    }
    break;
  }
  if (!get().abortRequested) {
    set((s) => {
      const next = [
        ...s.messages,
        {
          id: uid(),
          role: 'assistant' as const,
          content: full.trim() || '(empty response)',
          ts: Date.now(),
           provider: getProviderCfg().provider,
          model: getProviderCfg().model,
        },
      ];
      import('../services/chatHistoryService').then((m) => m.autoSave(next, s.mode as 'chat' | 'agent' | 'team' | 'dafb'));
      return { messages: next };
    });
  }
  set({ streamingContent: '' });
}

async function runAgentMode(userContent: string, set: SetFn, get: GetFn): Promise<void> {
  const getProviderCfg = () => {
    const s = useSettingsStore.getState().settings;
    return {
      provider: s.defaultProvider as Parameters<typeof streamChat>[0]['provider'],
      model: s.providers[s.defaultProvider]?.model || '',
    };
  };
  const truncate = (s: string, max: number) => (s.length > max ? s.slice(0, max) + '\n...[truncated]' : s);
  // For large projects, limit RAG to 5k chars, projectCtx to 7k, and history to 8 messages
  let ragContext = relevantContextFor(userContent, 5);
  ragContext = truncate(ragContext, 5500);
  let projectCtx = buildProjectContext();
  projectCtx = truncate(projectCtx, 7000);
  let userContentFull = ragContext ? `${ragContext}\n\n---\n\n${truncate(userContent, 10000)}` : truncate(userContent, 10000);

  // Collect MCP tools from enabled servers
  const mcpTools: Array<{ server: string; name: string; description?: string }> = [];
  const enabledServers = (useSettingsStore.getState().settings.mcpServers || []).filter((s) => s.enabled);
  for (const server of enabledServers) {
    try {
      const res = await window.velo.mcpConnect(server.name);
      for (const t of res.tools || []) mcpTools.push({ server: server.name, name: t.name, description: t.description });
    } catch {
      /* server offline — skip */
    }
  }

  const systemBase = `${buildAgentSystemPrompt(mcpTools)}\n\n${projectCtx}\n\n${getLanguageInstruction(userContent)}`;
  const system = truncate(systemBase, 10000);
  const rawHistory = historyForModel();
  const truncatedHistory = rawHistory.slice(-10, -1).map((h) => ({ ...h, content: truncate(h.content, 1800) }));
  const agentTouched = new Set<string>();
  const agenteRestored = await checkpoint.loadAgentCheckpoint(userContent);
  let restoredAgentConvo: Array<{ role: string; content: string }> | null = agenteRestored?.convo || null;
  if (agenteRestored?.touched) for (const p of agenteRestored.touched) agentTouched.add(p);
  if (restoredAgentConvo && get().messages.length <= 3) set((s) => ({ messages: [...s.messages, { id: uid(), role: 'assistant' as const, content: `↩️ استعادة تقدم Agent السابق — سيكمل من حيث توقف (${agentTouched.size} ملف)`, ts: Date.now() }] }));
  else if (agenteRestored && get().messages.length > 3) { restoredAgentConvo = null; agentTouched.clear(); }
  const convo: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = restoredAgentConvo
    ? (restoredAgentConvo.map((m) => ({ role: m.role as 'system' | 'user' | 'assistant', content: m.content })) as typeof restoredAgentConvo & Array<{ role: 'system' | 'user' | 'assistant'; content: string }>)
    : [
        { role: 'system', content: system },
        ...truncatedHistory,
        { role: 'user', content: userContentFull },
      ];
  let pendingToolBuffer = '';
  const saveAgentCheckpoint = () => checkpoint.saveAgentCheckpoint(convo, userContent, agentTouched);
  let noToolNudges = 0;
  let truncatedNudges = 0;
  let contextShrunk = false;
  for (let iter = 0; iter < MAX_AGENT_ITERATIONS; iter++) {
    if (get().abortRequested) break;
    if (convo.length > 14) {
      const systemMsg = convo[0];
      const recent = convo.slice(-12);
      const dropped = convo.slice(1, -12);
      const progressA = [...agentTouched].slice(0, 10).join(', ') || 'none yet';
      const summary = `[Earlier ${dropped.length} exchanges omitted — already created: ${progressA} — continue without recreating]`;
      convo.splice(0, convo.length, systemMsg, { role: 'user', content: summary } as typeof systemMsg, ...recent);
    }
    // Also ensure total chars < 32000, otherwise truncate oldest
    let totalChars = convo.reduce((a, m) => a + m.content.length, 0);
    while (totalChars > 32000 && convo.length > 4) {
      // Remove second message (oldest after system)
      convo.splice(1, 1);
      totalChars = convo.reduce((a, m) => a + m.content.length, 0);
    }
    set({ streamingContent: '' });
    const handle = streamChat(
      { ...getProviderCfg(), messages: convo, temperature: 0.3, maxTokens: 16384 },
      (chunk) => {
        if (!get().abortRequested) set((s) => ({ streamingContent: s.streamingContent + chunk }));
      },
      () => set({ streamingContent: '' })
    );
    activeStreamHandle = handle;
    const res = await handle.promise;
    activeStreamHandle = null;
    set({ streamingContent: '' });
    if (get().abortRequested || res.aborted) break;
      if (res.error) {
        if (!contextShrunk && /token|context|too large|maximum|too many|exceeded/i.test(res.error)) {
          contextShrunk = true;
          const smallerRag = truncate(ragContext, 2000);
          const smallerProj = truncate(projectCtx, 3000);
          const smallerSystem = truncate(`${buildAgentSystemPrompt(mcpTools)}\n\n${smallerProj}`, 5500);
          convo[0] = { role: 'system', content: smallerSystem };
          const lastIdx = convo.length - 1;
          if (convo[lastIdx].role === 'user') convo[lastIdx] = { role: 'user', content: truncate(userContent, 5000) };
          if (smallerRag) convo[convo.length - 1] = { role: 'user', content: truncate(`${smallerRag}\n\n---\n\n${userContent}`, 6000) };
          set({ streamingContent: '' });
          iter--;
          continue;
        }
        const isQuotaOrModel = /quota|billing|credit|invalid model|does not exist|not found|exceeded.*quota|\b402\b|\b404\b/i.test(res.error);
        const progressA = [...agentTouched].slice(0, 10).join(', ') || 'none yet';
        if (isQuotaOrModel) {
          set((s) => ({ ...s, messages: [...s.messages, { id: uid(), role: 'assistant' as const, content: `⚠️ Agent iter ${iter + 1} quota/model: ${res.error} — تم حفظ التقدم (${agentTouched.size} ملف) سيتم المحاولة بموديل free آخر`, ts: Date.now() }] }));
          convo.push({ role: 'user', content: `Provider failed (quota/model): ${res.error}. Already created: ${progressA}. Continue without recreating, try next free model.` });
          await saveAgentCheckpoint();
          await new Promise((r) => setTimeout(r, 2000));
          iter--;
          if (iter < -2) break;
          continue;
        }
        set((s) => ({
          ...s,
          messages: [...s.messages, { id: uid(), role: 'assistant' as const, content: `⚠️ Agent iter ${iter + 1}: ${res.error} — سيتم إعادة المحاولة بدون إعادة بداية (المحفوظ: ${progressA})`, ts: Date.now() }],
        }));
        import('../services/chatHistoryService').then((m) => m.autoSave(get().messages, 'agent'));
        convo.push({ role: 'user', content: `Provider error: ${res.error}. Already created: ${progressA}. Continue without restarting, only create missing files.` });
        await saveAgentCheckpoint();
        await new Promise((r) => setTimeout(r, 1500));
        iter--;
        continue;
      }
    let fullToParse = res.full;
    if (pendingToolBuffer) {
      const bufferedPath = pendingToolBuffer.match(/"path"\s*:\s*"([^"]+)"/)?.[1];
      const newPath = res.full.match(/"path"\s*:\s*"([^"]+)"/)?.[1];
      const isFreshRestart = !!(bufferedPath && newPath && bufferedPath === newPath && res.full.includes('{"tool"'));
      if (isFreshRestart) { pendingToolBuffer = ''; fullToParse = res.full; }
      else { fullToParse = pendingToolBuffer + res.full; pendingToolBuffer = ''; }
    }
    if (isTruncatedToolResponse(res.full) && truncatedNudges < 3) {
      const lenient = LenientJsonParser.extractWriteFile(res.full);
      if (lenient && lenient.isIncomplete) {
        try {
          const stitched = await ContinuationEngine.ensureFullFileContent(lenient.path, lenient.content, true);
          const fakeRaw = `{"tool":"write_file","path":"${lenient.path}","content":${JSON.stringify(stitched)}}`;
          const stitchedCalls = parseToolCalls(`\`\`\`tool\n${fakeRaw}\n\`\`\``);
          if (stitchedCalls.calls.length > 0) {
            const { output, step } = await executeTool(stitchedCalls.calls[0]);
            if (step.targetPath) agentTouched.add(step.targetPath);
            set((s) => ({ ...s, messages: [...s.messages, { id: uid(), role: 'assistant' as const, content: `🔧 Stitched truncated file ${lenient.path}: ${output}`, ts: Date.now() }] }));
            await AgentOrchestrator.handleAgentFileGeneration(fakeRaw, 'agent-stitch-' + Date.now());
            convo.push({ role: 'assistant', content: res.full });
            convo.push({ role: 'user', content: `TOOL RESULTS:\n[tool stitch] ${output}\n\nContinue.` });
            await saveAgentCheckpoint();
            continue;
          }
        } catch {}
      }
      truncatedNudges++;
      pendingToolBuffer = res.full;
      convo.push({ role: 'assistant', content: res.full });
      convo.push({ role: 'user', content: 'Tool block truncated — continue the same write_file JSON content from where you stopped to completion. Do NOT restart.' });
      continue;
    }
    const { calls, cleanText } = parseToolCalls(fullToParse);

    if (calls.length === 0) {
      // Auto-continue if truncated (maxTokens hit) — don't make user resend (allow up to 3 times)
      const looksTruncated = fullToParse.length > 12000 || /```[^`]*$/.test(fullToParse) || (fullToParse.trim().length > 0 && !/([.!?`}\n]|```)\s*$/.test(fullToParse.trim()) && fullToParse.length > 2000);
      if (looksTruncated && truncatedNudges < 3) {
        truncatedNudges++;
        convo.push({ role: 'assistant', content: fullToParse });
        convo.push({
          role: 'user',
          content: 'Continue exactly from where you stopped — do not repeat, just continue the same response (same tool block or text) to completion.',
        });
        continue;
      }
      if (/```/.test(fullToParse) && noToolNudges < 2) {
        noToolNudges++;
        const nudgeMsg =
          noToolNudges === 1
            ? 'Your reply showed code but contained NO tool blocks — FAILURE. You MUST use write_file tool blocks. Example:\n```tool\n{"tool":"write_file","path":"example.ext","content":"<FULL file content>"}\n```\nPerform ALL the changes now with tool blocks. Do NOT show code without tool.'
            : 'FINAL WARNING: STILL NO TOOL BLOCKS. EMIT write_file NOW for every file. No code outside tool blocks or task fails.';
        convo.push({ role: 'assistant', content: fullToParse });
        convo.push({ role: 'user', content: nudgeMsg });
        continue;
      }
      if (noToolNudges >= 2 && /```/.test(fullToParse)) {
        const codeBlocks = [...fullToParse.matchAll(/```(\w*)\n([\s\S]*?)```/g)];
        if (codeBlocks.length > 0) {
          for (let bi = 0; bi < Math.min(codeBlocks.length, 5); bi++) {
            const lang = codeBlocks[bi][1] || 'txt';
            const code = codeBlocks[bi][2];
            if (code.trim().length < 30) continue;
            // Infer path: look for // path: or /* path */ or first line comment
            let inferredPath = `src/generated-${Date.now()}-${bi}.${lang || 'ts'}`;
            const firstLine = code.split('\n')[0] || '';
            const pathMatch = firstLine.match(/path:\s*([^\s]+\.\w+)/i) || code.match(/\/\/\s*([^\s]+\.(ts|js|tsx|jsx|py|html|css|json))/);
            if (pathMatch) inferredPath = pathMatch[1];
            else if (lang === 'html') inferredPath = `index-${bi}.html`;
            else if (lang === 'css') inferredPath = `styles-${bi}.css`;
            try {
              const { output, step } = await executeTool({ tool: 'write_file', input: { path: inferredPath, content: code } });
              if (step.targetPath) agentTouched.add(step.targetPath);
              else agentTouched.add(inferredPath);
              set((s) => ({
                messages: [...s.messages, { id: uid(), role: 'assistant' as const, content: `🔧 Auto-saved code block to ${inferredPath}: ${output}`, ts: Date.now() }],
              }));
            } catch {}
          }
          if (get().deepReasoning) {
            const verify = await verifyProjectRuns();
            if (!verify.ok) {
              set((s) => ({ ...s, messages: [...s.messages, { id: uid(), role: 'assistant' as const, content: `🧠 الاستدلال العميق — فشل التشغيل (${verify.cmd}):\n\`\`\`\n${verify.log.slice(0, 3500)}\n\`\`\`\nسيتم الإصلاح...`, ts: Date.now() }] }));
              convo.push({ role: 'assistant', content: fullToParse });
              convo.push({ role: 'user', content: `Deep reasoning verification failed (${verify.cmd}):\n${verify.log.slice(0, 4000)}\n\nFix the errors so the project runs without errors. Already created: ${[...agentTouched].slice(0, 8).join(', ') || 'none'}` });
              await saveAgentCheckpoint();
              continue;
            } else {
              set((s) => ({ ...s, messages: [...s.messages, { id: uid(), role: 'assistant' as const, content: `✅ الاستدلال العميق — المشروع يعمل (${verify.cmd})`, ts: Date.now() }] }));
            }
          }
          set((s) => {
            const next = [...s.messages, { id: uid(), role: 'assistant' as const, content: cleanText || fullToParse || '(done) — code blocks auto-saved where possible', ts: Date.now(), provider: getProviderCfg().provider }];
            import('../services/chatHistoryService').then((m) => m.autoSave(next, s.mode as 'chat' | 'agent' | 'team' | 'dafb'));
            return { messages: next };
          });
          try { await checkpoint.clearAgentCheckpoint(); } catch {}
          return;
        }
      }
      if (get().deepReasoning) {
        const verify = await verifyProjectRuns();
        if (!verify.ok) {
          set((s) => ({ ...s, messages: [...s.messages, { id: uid(), role: 'assistant' as const, content: `🧠 الاستدلال العميق — فشل التشغيل (${verify.cmd}):\n\`\`\`\n${verify.log.slice(0, 3500)}\n\`\`\`\nسيتم الإصلاح...`, ts: Date.now() }] }));
          convo.push({ role: 'assistant', content: fullToParse });
          convo.push({ role: 'user', content: `Deep reasoning verification failed (${verify.cmd}):\n${verify.log.slice(0, 4000)}\n\nFix the errors so the project runs without errors. Already created: ${[...agentTouched].slice(0, 8).join(', ') || 'none'}` });
          await saveAgentCheckpoint();
          continue;
        } else {
          set((s) => ({ ...s, messages: [...s.messages, { id: uid(), role: 'assistant' as const, content: `✅ الاستدلال العميق — المشروع يعمل (${verify.cmd})`, ts: Date.now() }] }));
        }
      }
      set((s) => {
         const next = [...s.messages, { id: uid(), role: 'assistant' as const, content: cleanText || fullToParse || '(done)', ts: Date.now(), provider: getProviderCfg().provider }];
        import('../services/chatHistoryService').then((m) => m.autoSave(next, s.mode as 'chat' | 'agent' | 'team' | 'dafb'));
        return { messages: next };
      });
      try { await checkpoint.clearAgentCheckpoint(); } catch {}
      return;
    }
    truncatedNudges = 0;
    noToolNudges = 0;
    const steps: AgentStep[] = calls.map((c) => ({
      tool: c.tool,
      input: c.input,
      status: 'running' as const,
    }));
    const assistantMsgId = uid();
    set((s) => ({
      messages: [
        ...s.messages,
        {
          id: assistantMsgId,
          role: 'assistant' as const,
          content: cleanText || 'Working…',
          ts: Date.now(),
           provider: getProviderCfg().provider,
          steps,
        },
      ],
    }));

    const results: string[] = [];
    for (let i = 0; i < calls.length; i++) {
      if (get().abortRequested) break;
      const { output, step } = await executeTool(calls[i]);
      if (calls[i].tool === 'write_file' && step.targetPath) agentTouched.add(step.targetPath);
      results.push(`[tool ${i + 1}: ${calls[i].tool}] ${output}`);
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === assistantMsgId && m.steps
            ? { ...m, steps: m.steps.map((st, idx) => (idx === i ? { ...step, reverted: st.reverted } : st)) }
            : m
        ),
      }));
    }

    convo.push({ role: 'assistant', content: fullToParse });
    convo.push({
      role: 'user',
      content: `TOOL RESULTS:\n${results.join('\n\n')}\n\nContinue. If the task is complete, reply with a summary (no tool block).`,
    });
    await saveAgentCheckpoint();
    import('../services/chatHistoryService').then((m) => m.autoSave(get().messages, 'agent'));
  }
  let finalVerifyOk = true;
  if (get().deepReasoning && !get().abortRequested) {
    if (agentTouched.size > 0) {
      const verify = await verifyProjectRuns();
      if (verify.ok) {
        set((s) => ({ ...s, messages: [...s.messages, { id: uid(), role: 'assistant' as const, content: `✅ **الاستدلال العميق — تحقق نهائي: المشروع يعمل** (${verify.cmd})\n\`\`\`\n${verify.log.slice(0, 2500)}\n\`\`\``, ts: Date.now() }] }));
        finalVerifyOk = true;
      } else {
        set((s) => ({ ...s, messages: [...s.messages, { id: uid(), role: 'assistant' as const, content: `❌ **الاستدلال العميق — تحقق نهائي فشل** (${verify.cmd}):\n\`\`\`\n${verify.log.slice(0, 3500)}\n\`\`\`\nراجع السجل وصلّح يدوياً أو أعد التشغيل مع الاستدلال العميق`, ts: Date.now() }] }));
        finalVerifyOk = false;
        await saveAgentCheckpoint();
      }
    }
    if (finalVerifyOk) {
      try { await checkpoint.clearAgentCheckpoint(); } catch {}
    }
  } else if (!get().deepReasoning) {
    try { await checkpoint.clearAgentCheckpoint(); } catch {}
  }
  set({ streamingContent: '' });
}
