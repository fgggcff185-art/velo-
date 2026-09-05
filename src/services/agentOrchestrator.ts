import { LenientJsonParser } from '../utils/lenientJsonParser';
import { ContinuationEngine } from './continuationEngine';
import { useChatStore } from '../store/useChatStore';

export class AgentOrchestrator {
  private static createdFilesRegistry: Set<string> = new Set();

  public static async handleAgentFileGeneration(rawResponse: string, assistantMsgId: string) {
    const store = useChatStore.getState();
    const parsed = LenientJsonParser.extractWriteFile(rawResponse);
    if (!parsed) return;

    let finalFileContent = parsed.content;

    if (parsed.isIncomplete) {
      finalFileContent = await ContinuationEngine.ensureFullFileContent(
        parsed.path,
        parsed.content,
        true
      );
    }

    if ((window as any).velo?.writeFile) {
      try { await (window as any).velo.writeFile(parsed.path, finalFileContent); } catch {}
    } else if ((window as any).electronAPI?.writeFile) {
      await (window as any).electronAPI.writeFile(parsed.path, finalFileContent);
    }

    this.createdFilesRegistry.add(parsed.path);

    // Use the chat store's attach method if available, otherwise fallback
    try {
      const s = useChatStore.getState() as any;
      if (s.attachCreatedFile) s.attachCreatedFile(assistantMsgId, { path: parsed.path, action: 'created', timestamp: Date.now() });
      else if (s.attachFileToMessage) s.attachFileToMessage(assistantMsgId, { path: parsed.path, action: 'created', timestamp: Date.now() });
    } catch {}

    console.log(`[Velo File Safe] تم تثبيت الملف: ${parsed.path} (إجمالي الملفات المستقرة: ${this.createdFilesRegistry.size})`);
  }

  public static getCreatedFiles(): string[] {
    return Array.from(this.createdFilesRegistry);
  }

  public static clearRegistry(): void {
    this.createdFilesRegistry.clear();
  }
}
