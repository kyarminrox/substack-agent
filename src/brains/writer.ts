import { resolveProvider } from '../infra/gateway.js';
import { retry } from '../infra/retry.js';
import { logJson } from '../infra/logger.js';
import { appendRun } from '../infra/runs.js';
import type { AIResponse } from '../types/ai.js';

export type WriterInput = { topic: string; model?: string };
export type WriterOutput = { title: string; html: string };

export async function generateDraft({ topic, model }: WriterInput): Promise<WriterOutput> {
  const provider = resolveProvider(model);
  const req = { prompt: topic, model };

  const res: AIResponse = await retry(async () => {
    logJson('ai', 'info', { provider: provider.name, model, prompt: topic });
    return provider.generate(req);
  });

  // Persist richer metadata if the provider returned an explicit model.
  appendRun('writer', {
    provider: provider.name,
    model: (res.meta as { model?: string } | undefined)?.model ?? model,
    prompt: topic,
  });

  const safe = topic.trim().replace(/\s+/g, ' ');
  const title = safe.replace(/\b\w/g, (c) => c.toUpperCase());
  const html = `<h1>${title}</h1>\n<p>${res.text}</p>`;
  return { title, html };
}
