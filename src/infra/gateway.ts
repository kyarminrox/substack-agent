import 'dotenv/config';
import Groq from 'groq-sdk';
import type { AIRequest, AIResponse } from '../types/ai.js';

export interface Provider {
  name: string;
  generate(req: AIRequest): Promise<AIResponse>;
}

class LocalProvider implements Provider {
  name = 'local';
  async generate(req: AIRequest): Promise<AIResponse> {
    return { text: `Local stub for: ${req.prompt}`, meta: { provider: 'local' } };
  }
}

class GroqProvider implements Provider {
  name = 'groq';
  private client: Groq;

  constructor() {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error('Missing GROQ_API_KEY for GroqProvider');
    this.client = new Groq({ apiKey });
  }

  async generate(req: AIRequest): Promise<AIResponse> {
    // Respect explicit --model first, then env, then a sane default you have access to.
    const model = (req.model ?? process.env.GROQ_MODEL ?? 'llama-3.1-8b-instant').trim();

    try {
      const completion = await this.client.chat.completions.create({
        model,
        messages: [{ role: 'user', content: req.prompt }],
      });
      const text = completion.choices?.[0]?.message?.content ?? '';
      return { text, meta: { provider: this.name, model } };
    } catch (e: any) {
      // Surface non-retryable model errors immediately (so our retry wrapper won't keep trying).
      const code = e?.error?.code ?? e?.code;
      if (code === 'model_not_found' || code === 'invalid_request_error') {
        throw e;
      }
      throw e;
    }
  }
}

class OpenAIProvider implements Provider {
  name = 'openai';
  async generate(_req: AIRequest): Promise<AIResponse> {
    throw new Error('not implemented');
  }
}

class ClaudeProvider implements Provider {
  name = 'claude';
  async generate(_req: AIRequest): Promise<AIResponse> {
    throw new Error('not implemented');
  }
}

export function resolveProvider(override?: string): Provider {
  const name = (override || process.env.AI_PROVIDER || 'local').toLowerCase();

  // Treat known Groq model IDs as Groq-backed.
  const groqModels = new Set([
    // older examples
    'meta-llama/llama-4-scout-17b-16e-instruct',
    'meta-llama/llama-4-maverick-17b-128e-instruct',
    'deepset-r1-distill-llama-70b',
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
  ]);

  if (groqModels.has(name)) return new GroqProvider();

  switch (name) {
    case 'groq':
      return new GroqProvider();
    case 'openai':
      return new OpenAIProvider();
    case 'claude':
      return new ClaudeProvider();
    case 'local':
    default:
      return new LocalProvider();
  }
}
