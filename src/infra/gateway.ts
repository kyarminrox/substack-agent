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
  async generate(req: AIRequest): Promise<AIResponse> {
    // TODO: integrate Groq API later (llama3-groq-tool-use models).
    return { text: `Groq stub for: ${req.prompt}`, meta: { provider: 'groq' } };
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
