import type { PlatformDriver } from './platformDriver.js';
import type { PostDraftInput, PublishPostInput, NoteInput, Comment, Stats, StatsRange } from '../types/schemas.js';
import { env, flags } from '../infra/config.js';
import { openContext, newPage, saveAuthState, humanPause } from '../infra/playwright.js';
import { retry } from '../infra/retry.js';
import { logJson } from '../infra/logger.js';
import { appendRun } from '../infra/runs.js';
import {
  TITLE_INPUT,
  TITLE_INPUT_FALLBACKS,
  BODY_EDITOR,
  BODY_EDITOR_FALLBACKS,
  PUBLISH_BUTTON,
  PUBLISH_BUTTON_FALLBACKS,
  waitForFirstVisible,
} from '../infra/selectors/substack.js';
import { DISMISS_MODAL_CANDIDATES, CREATE_NEW_BUTTON, CREATE_POST_MENU_ITEM } from '../infra/selectors/substack.js';
import fs from 'node:fs';
import path from 'node:path';

const AUTH_PATH = path.join(env.SUBSTACK_AUTH_DIR, 'substack.json');

export class SubstackDriver implements PlatformDriver {
  readonly name = 'substack';

  async ensureAuth(): Promise<void> {
    if (!fs.existsSync(AUTH_PATH)) {
      throw new Error(
        `No Substack auth found at ${path.resolve(AUTH_PATH)}. Run: npm run auth:substack`,
      );
    }
  }

  async createDraft(input: PostDraftInput): Promise<{ id: string; editUrl?: string }> {

    await this.ensureAuth();

    const { browser, context } = await openContext();
    try {
      const page = await newPage(context);
      const composeUrl = env.SUBSTACK_PUBLICATION_URL
        ? `${env.SUBSTACK_PUBLICATION_URL}/publish/post`
        : `${env.SUBSTACK_BASE_URL}/publish/post`;
      await retry(() => page.goto(composeUrl), { attempts: 3, delayMs: 500 });
      await page.waitForLoadState('domcontentloaded');
      await page.waitForSelector('body', { state: 'visible', timeout: 10_000 });
      logJson('substack', 'info', { ev: 'compose_opened', url: composeUrl });

      // (A) dismiss the “dashboard got a refresh!” modal if present
      try {
        const gotIt = await page.$('role=button[name=/^(Got it|Close)$/i]');
        if (gotIt) await gotIt.click();
        else {
          const closeX = await page.$('button[aria-label="Close"]');
          if (closeX) await closeX.click();
        }
      } catch { /* ignore */ }
      if (page.url().includes('/publish/home')) {
        const createBtn = await page.$(CREATE_NEW_BUTTON);
        if (createBtn) {
          await createBtn.click().catch(() => {});
          await page.waitForSelector(CREATE_POST_MENU_ITEM, { timeout: 3000 }).catch(() => {});
          const postItem = await page.$(CREATE_POST_MENU_ITEM);
          if (postItem) await postItem.click().catch(() => {});
        }
      }
      try {
        await page.waitForLoadState('networkidle');
      } catch {
        // ignore quick timeout
      }
      const titleSel = await retry(
        () => waitForFirstVisible(page, [TITLE_INPUT, ...TITLE_INPUT_FALLBACKS]),
        { attempts: 3, delayMs: 400 },
      );
      const bodySel = await retry(
        () => waitForFirstVisible(page, [BODY_EDITOR, ...BODY_EDITOR_FALLBACKS]),
        { attempts: 3, delayMs: 400 },
      );
      console.log('Navigated to composer:', composeUrl);
      await humanPause();
      logJson('substack', 'info', { ev: 'title_fill', safeSkip: flags.safeMode, selector: titleSel });
      console.log(`Typing title into: ${titleSel}`);
      if (flags.safeMode) {
        console.log('SAFE_MODE – skipping title fill');
      } else {
        await page.click(titleSel);
        await page.fill(titleSel, input.title);
      }
      logJson('substack', 'info', { ev: 'body_insert', safeSkip: flags.safeMode, selector: bodySel });
      console.log(`Inserting body HTML into: ${bodySel}`);
      if (flags.safeMode) {
        console.log('SAFE_MODE – skipping body HTML insertion');
        console.log('SAFE_MODE – skipping editor verification');
      } else {
        await page.click(bodySel);
        let inserted = false;
        try {
          await page.evaluate(async (html: string) => {
            const plain = html.replace(/<[^>]+>/g, ' ');
            const item = new ClipboardItem({
              'text/html': new Blob([html], { type: 'text/html' }),
              'text/plain': new Blob([plain], { type: 'text/plain' }),
            });
            await navigator.clipboard.write([item]);
          }, input.html);

          const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
          await page.keyboard.down(mod);
          await page.keyboard.press('KeyV');
          await page.keyboard.up(mod);
          inserted = true;
        } catch (e) {
          console.warn('Clipboard HTML paste failed, will try execCommand/typing:', e);
        }

        if (!inserted) {
          try {
            await page.evaluate(({ html, sel }: { html: string; sel: string }) => {
              const root = document.querySelector(sel) as HTMLElement | null;
              if (!root) throw new Error('editor not found');
              const range = document.createRange();
              range.selectNodeContents(root);
              range.collapse(true);
              const seln = window.getSelection();
              seln?.removeAllRanges();
              seln?.addRange(range);
              document.execCommand('insertHTML', false, html);
            }, { html: input.html, sel: bodySel });
            inserted = true;
          } catch {}
        }

        if (!inserted) {
          await page.type(bodySel, input.html.replace(/<[^>]+>/g, ' '));
        }

        // Nudge to guarantee an input event even after paste/insert
        await page.keyboard.type(' ');
        await page.keyboard.press('Backspace');

        // Blur editor by focusing title, then the page body
        await page.click(titleSel, { delay: 50 });
        await page.click('body', { delay: 50 });

        // Wait for autosave UI OR network quiet
        try {
          await page.waitForSelector('text=/Saved/i', { timeout: 5000 });
        } catch {
          await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
        }

        // Strong verification: content present in the model
        await page.evaluate((sel: string) => { (window as any).__SS_BODY_SEL = sel; }, bodySel);
        await page.waitForFunction(() => {
          const sel = (window as any).__SS_BODY_SEL as string | undefined;
          if (!sel) return false;
          const el = document.querySelector(sel);
          return !!el && !!el.textContent && el.textContent.trim().length > 0;
        }, { timeout: 7000 });
        console.log('Editor content verified');
      }
      if (input.tags?.length) {
        console.log('TODO: apply tags', input.tags);
      }
      const id = `draft_${Date.now()}`;
      const editUrl = page.url();
      // (Optional) Smoke-check persistence in-session
      try {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForSelector(bodySel, { state: 'visible' });
        const ok = await page.evaluate((sel: string) => !!document.querySelector(sel)?.textContent?.trim(), bodySel);
        console.log('Post reload content present:', ok);
      } catch {}
      console.log('Draft created', id, editUrl);
      await humanPause();
      await saveAuthState(context);
      console.log('Saved Substack auth state to:', path.resolve(AUTH_PATH));
      appendRun('substack-drafts', { id, editUrl, title: input.title ?? '', source: 'createDraft' });
      logJson('substack', 'info', { ev: 'draft_created', id, editUrl, title: input.title ?? '' });

      return { id, editUrl };
    } finally {
      await context.close();
      await browser.close();
    }
  }

  async publishPost(input: PublishPostInput): Promise<{ publicUrl: string }> {

    await this.ensureAuth();
    if (!env.SUBSTACK_PUBLICATION_URL) {
      throw new Error('SUBSTACK_PUBLICATION_URL not configured');
    }
    const { browser, context } = await openContext();
    try {
      const page = await newPage(context);
      const composeUrl = `${env.SUBSTACK_PUBLICATION_URL}/publish/post`;
      await retry(() => page.goto(composeUrl), { attempts: 3, delayMs: 500 });
      await page.waitForLoadState('domcontentloaded');
      await dismissAnyModal(page);
      logJson('substack', 'info', { ev: 'compose_opened', url: composeUrl });
      if (page.url().includes('/publish/home')) {
        const createBtn = await page.$(CREATE_NEW_BUTTON);
        if (createBtn) {
          await createBtn.click().catch(() => {});
          await page.waitForSelector(CREATE_POST_MENU_ITEM, { timeout: 3000 }).catch(() => {});
          const postItem = await page.$(CREATE_POST_MENU_ITEM);
          if (postItem) await postItem.click().catch(() => {});
        }
      }
      try {
        await page.waitForLoadState('networkidle');
      } catch {
        // ignore
      }
      await page.waitForSelector('body', { state: 'visible', timeout: 10_000 });
      const publishSel = await retry(
        () => waitForFirstVisible(page, [PUBLISH_BUTTON, ...PUBLISH_BUTTON_FALLBACKS]),
        { attempts: 3, delayMs: 400 },
      );
      console.log('Opened composer to publish draft', input.id);
      if (input.scheduleAt) {
        console.log('TODO: schedule publish at', input.scheduleAt);
      }
      logJson('substack', 'info', { ev: 'publish_click', safeSkip: flags.safeMode, selector: publishSel });
      console.log('Clicking publish button via', publishSel);
      if (flags.safeMode) {
        console.log('SAFE_MODE – skipping publish click');
      } else {
        await page.click(publishSel);
        await page.waitForTimeout(500);
      }
      logJson('substack', 'info', { ev: 'publish_click', safeSkip: flags.safeMode, selector: publishSel });
      const publicUrl = page.url();
      console.log('Post published', publicUrl);
      await saveAuthState(context);

      console.log('Saved Substack auth state to:', path.resolve(AUTH_PATH));

      return { publicUrl };
    } finally {
      await context.close();
      await browser.close();
    }
  }

  async createNote(_input: NoteInput): Promise<{ url?: string }> {
    // TODO: implement via Playwright Notes composer
    throw new Error('Not implemented: SubstackDriver.createNote');
  }

  async listComments(_params: { since?: string }): Promise<Comment[]> {
    // TODO: implement by scraping post comments thread
    throw new Error('Not implemented: SubstackDriver.listComments');
  }

  async replyToComment(_input: { commentId: string; text: string }): Promise<void> {
    // TODO: implement by posting via UI automation
    throw new Error('Not implemented: SubstackDriver.replyToComment');
  }

  async getStats(_params: { range: StatsRange }): Promise<Stats> {
    // TODO: implement if feasible, else return placeholder
    throw new Error('Not implemented: SubstackDriver.getStats');
  }
}

async function dismissAnyModal(page: import('playwright').Page) {
  for (const sel of DISMISS_MODAL_CANDIDATES) {
    const el = await page.$(sel);
    if (el) {
      await el.click().catch(() => {});
      await page.waitForTimeout(300);
      break;
    }
  }
}
