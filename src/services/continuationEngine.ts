import { AIServiceResilient } from './aiResilientService';

export class ContinuationEngine {
  public static async ensureFullFileContent(
    filePath: string,
    initialContent: string,
    needsContinuation: boolean
  ): Promise<string> {
    let completeCode = initialContent;
    let isStillCutOff = needsContinuation;
    let continuationCycles = 0;

    while (isStillCutOff && continuationCycles < 3) {
      console.warn(`[Velo Continuation] الملف ${filePath} انقطع. جاري الاستكمال الصامت بالمفتاح التالي...`);
      // Use the resilient service's rotate if available, otherwise just log
      try { (AIServiceResilient as any).rotateToNextKey?.(); } catch {}
      const lastContextLines = completeCode.split('\n').slice(-25).join('\n');
      const continuationPrompt = `CRITICAL TASK: Code generation for file "${filePath}" was CUT OFF because of token limits.
Here are the LAST LINES successfully generated:
\`\`\`
${lastContextLines}
\`\`\`

INSTRUCTIONS:
1. Continue generating the rest of "${filePath}" EXACTLY starting from the cut-off point.
2. Do NOT repeat the previous lines.
3. Do NOT provide introductory or explanatory text. Output ONLY the remaining code to finish the file.`;

      try {
        const result = await AIServiceResilient.executeResilientRequest(
          'You are an expert compiler finishing truncated source code files.',
          continuationPrompt,
          'gemini-3.6-flash'
        );
        const cleanChunk = result.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trimEnd();
        completeCode += '\n' + cleanChunk;
        // Check if still cut off by checking if result ends abruptly
        isStillCutOff = cleanChunk.length > 7000 && !/[}\n;]\s*$/.test(cleanChunk);
        continuationCycles++;
      } catch (err) {
        console.error('تعذر استكمال الجزء المتبقي، سيتم حفظ ما تم كتابته:', err);
        break;
      }
    }

    return completeCode;
  }
}
