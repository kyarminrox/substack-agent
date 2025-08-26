import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // Medium token (user integration token or OAuth bearer)
  MEDIUM_TOKEN: z.string().optional(),
  SUBSTACK_AUTH_DIR: z.string().default('playwright/.auth'),
  SUBSTACK_BASE_URL: z.string().url().default('https://substack.com'),
  SUBSTACK_PUBLICATION_URL: z.string().url().optional(),
  SUBSTACK_HEADLESS: z.enum(['true', 'false']).default('true'),
  SAFE_MODE: z.enum(['true', 'false']).default('false'),
});

export const env = EnvSchema.parse(process.env);

export const flags = {
  headless: env.SUBSTACK_HEADLESS === 'true',
  safeMode: env.SAFE_MODE === 'true',
};
