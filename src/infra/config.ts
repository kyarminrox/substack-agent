import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // Medium token (user integration token or OAuth bearer)
  MEDIUM_TOKEN: z.string().optional(),
  // For future: Substack Playwright storage path
  SUBSTACK_AUTH_DIR: z.string().optional(),
});

export const env = EnvSchema.parse(process.env);
