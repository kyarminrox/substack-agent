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
    const allowed = [
      'llama3-groq-70b-tool-use-preview',
      'llama3-groq-8b-tool-use-preview',
    ];
    const model = allowed.includes(String(req.model))
      ? String(req.model)
      : 'llama3-groq-8b-tool-use-preview';

    const completion = await this.client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: req.prompt }],
    });

    const text = completion.choices?.[0]?.message?.content ?? '';
    return { text, meta: { provider: this.name, model } };
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

/**
 * Resolve a provider by name or a model override.
 * - "groq" -> GroqProvider
 * - "local" -> LocalProvider
 * - "openai"/"claude" -> stubs
 * - Groq model ids (e.g., "llama3-groq-8b-tool-use-preview") -> GroqProvider
 */
export function resolveProvider(override?: string): Provider {
  const name = (override || process.env.AI_PROVIDER || 'local').toLowerCase();

  if (/^llama3-groq-/.test(name)) return new GroqProvider();

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
