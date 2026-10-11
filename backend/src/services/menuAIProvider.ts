import { fetchWithGeminiFallback } from './geminiKeys';

export function getMenuAIModels(): string[] {
    const primary = process.env.GEMINI_MENU_MODEL?.trim() || 'gemini-3.5-flash-lite';
    const fallbacks = process.env.GEMINI_MENU_FALLBACK_MODELS ?? 'gemini-flash-lite-latest,gemini-3.8-flash';
    return [...new Set([primary, ...fallbacks.split(',')].map(model => model.trim()).filter(Boolean))];
}

export async function fetchMenuAI(request: { contents: unknown[]; generationConfig: Record<string, unknown> }): Promise<Response> {
    const urls = getMenuAIModels().map(model => `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`);
    return fetchWithGeminiFallback(urls, url => {
        const model = decodeURIComponent(new URL(url).pathname.split('/models/')[1].split(':')[0]);
        const thinkingConfig = model.startsWith('gemini-3') || model === 'gemini-flash-lite-latest'
            ? { thinkingLevel: model.includes('flash-lite') ? 'minimal' : 'low' }
            : model.startsWith('gemini-2.5-flash') ? { thinkingBudget: 0 } : undefined;
        return JSON.stringify({ ...request, generationConfig: { ...request.generationConfig, ...(thinkingConfig ? { thinkingConfig } : {}) } });
    }, { attemptTimeoutMs: 15000, fallbackOnModelError: true });
}
