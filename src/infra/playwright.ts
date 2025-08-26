import { chromium, Browser, BrowserContext, Page } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { env, flags } from './config.js';

const AUTH_PATH = path.join(env.SUBSTACK_AUTH_DIR, 'substack.json');

export async function openContext(): Promise<{ browser: Browser; context: BrowserContext }> {
  const browser = await chromium.launch({ headless: flags.headless });
  const ctxOptions: { storageState?: string } = {};
  if (fs.existsSync(AUTH_PATH)) {
    ctxOptions.storageState = AUTH_PATH;
  }
  const context = await browser.newContext({
    ...(ctxOptions.storageState ? { storageState: ctxOptions.storageState } : {}),
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  return { browser, context };
}

export async function saveAuthState(context: BrowserContext): Promise<void> {
  await fs.promises.mkdir(env.SUBSTACK_AUTH_DIR, { recursive: true });
  await context.storageState({ path: AUTH_PATH });
}

export async function newPage(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  return page;
}

export const snooze = (ms: number) => new Promise((res) => setTimeout(res, ms));

export async function humanPause(min = 400, max = 900): Promise<void> {
  const duration = Math.floor(Math.random() * (max - min + 1)) + min;
  await snooze(duration);
}
