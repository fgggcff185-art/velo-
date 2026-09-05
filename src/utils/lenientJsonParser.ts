export interface ExtractedToolCall {
  path: string;
  content: string;
  isIncomplete: boolean;
}

export class LenientJsonParser {
  public static extractWriteFile(rawText: string): ExtractedToolCall | null {
    const pathMatch = rawText.match(/"path"\s*:\s*"([^"]+)"/);
    if (!pathMatch) return null;
    const path = pathMatch[1];
    const contentKeyIndex = rawText.indexOf('"content":');
    if (contentKeyIndex === -1) return null;
    let partialContent = rawText.slice(contentKeyIndex + 10).trim();
    if (partialContent.startsWith('"')) {
      partialContent = partialContent.slice(1);
    }
    const trimmed = rawText.trim();
    const isIncomplete = !trimmed.endsWith('}') || !trimmed.endsWith('"}');
    // More accurate: check if ends with } and " 
    const actuallyIncomplete = !trimmed.endsWith('}') && !trimmed.endsWith('"}') || trimmed.endsWith('\\"') || !trimmed.includes('"}');
    // Use simple heuristic: if raw ends without } or without closing quote, it's incomplete
    const incomplete = !rawText.trim().endsWith('}') || rawText.trim().endsWith('\\"');
    // For our use, consider incomplete if raw doesn't end with } or contains unclosed string
    const isInc = isIncomplete || actuallyIncomplete || incomplete;
    if (isInc) {
      partialContent = partialContent.replace(/"\s*}?$/, '');
    }
    return {
      path,
      content: partialContent.replace(/\\n/g, '\n').replace(/\\"/g, '"'),
      isIncomplete: isInc
    };
  }
}
