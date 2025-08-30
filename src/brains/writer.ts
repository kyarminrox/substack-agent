import { resolveProvider } from '../infra/gateway.js';
import { retry } from '../infra/retry.js';
import { logJson } from '../infra/logger.js';
import { appendRun } from '../infra/runs.js';
import { mdToHtml, stripLeadingMdTitle } from '../infra/markdown.js';
import type { AIResponse } from '../types/ai.js';

export type WriterInput = { topic: string; model?: string; updateLast?: boolean; overrideTitle?: string };
export type WriterOutput = { title: string; html: string; editUrl?: string };

export async function generateDraft({ topic, model, updateLast, overrideTitle }: WriterInput): Promise<WriterOutput> {
  const provider = resolveProvider(model);

  const aiPrompt = [
    `Topic: ${topic}`,
    '',
    'Write a concise draft in **Markdown**:',
    '- Use headings (##, ###) – do NOT include a top-level # Title.',
    '- Use short paragraphs and bullet lists where helpful.',
    '- Bold key phrases with **bold**; use _italics_ sparingly.',
    '- No front-matter, no HTML; Markdown only.',
  ].join('\n');

  const req = { prompt: aiPrompt, model };

  const res: AIResponse = await retry(async () => {
    logJson('ai', 'info', { provider: provider.name, model, prompt: aiPrompt });
    try {
      return await provider.generate(req);
    } catch (e: any) {
      const code = e?.error?.code ?? e?.code;
      // Break out of retry loop for permanent 4xx
      if (code === 'model_not_found' || code === 'invalid_request_error') throw e;
      throw e;
    }
  });

  // Keep run semantics (store original topic prompt)
  appendRun('writer', {
    provider: provider.name,
    model: (res.meta as { model?: string } | undefined)?.model ?? model,
    prompt: topic,
  });

  const safeTitle = topic.trim().replace(/\s+/g, ' ');
  const title = safeTitle.replace(/\b\w/g, (c) => c.toUpperCase());

  // Convert Markdown → HTML and strip duplicate H1 if present
  const cleanedMd = stripLeadingMdTitle(res.text ?? '');
  const html = mdToHtml(cleanedMd);

  // Always just return rendered content; CLI decides create vs update.
  return { title: overrideTitle || title, html };
}
