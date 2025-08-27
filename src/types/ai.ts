export type AIRequest = { prompt: string; model?: string };
export type AIResponse = { text: string; meta?: Record<string, unknown> };
