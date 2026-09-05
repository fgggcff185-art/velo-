import { useChatStore } from '../store/useChatStore';

export class AIServiceResilient {
  private static googleKeys: string[] = [];
  private static currentKeyIndex = 0;

  private static readonly FALLBACK_MODELS = [
    'gemini-3.6-flash',
    'gemini-3.7-flash'
  ];

  public static setKeyPool(keys: string[]) {
    this.googleKeys = keys.filter((k) => k && k.trim().length > 0);
    this.currentKeyIndex = 0;
  }

  private static getActiveKey(): string {
    if (this.googleKeys.length === 0) return '';
    return this.googleKeys[this.currentKeyIndex % this.googleKeys.length];
  }

  private static rotateKey(): void {
    if (this.googleKeys.length > 1) {
      this.currentKeyIndex = (this.currentKeyIndex + 1) % this.googleKeys.length;
      console.log(`[AIService] تبديل صامت إلى المفتاح (${this.currentKeyIndex + 1}/${this.googleKeys.length})`);
    }
  }

  public static async executeResilientRequest(
    systemPrompt: string,
    userPrompt: string,
    preferredModel: string = 'gemini-3.6-flash'
  ): Promise<string> {
    const totalKeys = Math.max(this.googleKeys.length, 1);
    const modelsToTry = [
      preferredModel,
      ...this.FALLBACK_MODELS.filter((m) => m !== preferredModel)
    ];

    let lastError = '';

    for (const model of modelsToTry) {
      let keyAttempts = 0;

      while (keyAttempts < totalKeys) {
        const apiKey = this.getActiveKey();
        if (!apiKey) {
          throw new Error('لم يتم تعيين مفتاح API صالح في الإعدادات.');
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              contents: [
                {
                  role: 'user',
                  parts: [{ text: `${systemPrompt}\n\nTask: ${userPrompt}` }]
                }
              ]
            })
          });

          clearTimeout(timeoutId);

          if (response.ok) {
            const data = await response.json();
            return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          }

          const errJson = await response.json().catch(() => ({}));
          const status = response.status;
          const msg = (errJson.error?.message || '').toLowerCase();

          if (status === 429 || status === 403 || status === 503 || msg.includes('quota') || msg.includes('demand')) {
            this.rotateKey();
            keyAttempts++;
            continue;
          }

          if (status === 404) {
            lastError = `Model ${model} not found`;
            break;
          }

          throw new Error(errJson.error?.message || `HTTP ${status}`);
        } catch (err: any) {
          clearTimeout(timeoutId);
          lastError = err.message;
          this.rotateKey();
          keyAttempts++;
        }
      }
    }

    throw new Error(`تعذر استكمال الطلب عبر جميع المفاتيح والنماذج المتاحة (${lastError})`);
  }
}
