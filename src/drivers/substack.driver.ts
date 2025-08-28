import type { PlatformDriver } from './platformDriver.js';
import type { PostDraftInput, NoteInput, Comment, Stats, StatsRange } from '../types/schemas.js';
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
} from '../infra/selectors/substack.js';
import {
  CONTINUE_BUTTON, CONTINUE_BUTTON_FALLBACKS,
  PUBLISH_NOW, PUBLISH_NOW_FALLBACKS,
  SEND_EMAIL_CHECKBOX, SEND_EMAIL_CHECKBOX_FALLBACKS,
  TITLE_TESTING_TOGGLE, TITLE_TESTING_TOGGLE_FALLBACKS,
  SCHEDULE_TOGGLE, SCHEDULE_TOGGLE_FALLBACKS,
  SCHEDULE_DATE_INPUT, SCHEDULE_TIME_INPUT,
  SCHEDULE_CONFIRM_PRIMARY, SCHEDULE_CONFIRM_FALLBACKS,
  waitForFirstVisible,
} from '../infra/selectors/substack.js';
import { CREATE_NEW_BUTTON, CREATE_POST_MENU_ITEM } from '../infra/selectors/substack.js';
import fs from 'node:fs';
import path from 'node:path';

async function ensureCheckbox(
  page: import('playwright').Page,
  selector: string,
  desired: boolean,
): Promise<void> {
  const el = await page.$(selector);
  if (!el) return;
  const checked = await el.isChecked().catch(() => false);
  if (checked !== desired) {
    await el.click({ force: true });
  }
}

const AUTH_PATH = path.join(env.SUBSTACK_AUTH_DIR, 'substack.json');

export type PublishPostInput = {
  id?: string;              // legacy optional
  postId?: string;          // e.g. "172159950"
  editUrl?: string;         // e.g. "https://yourpub.substack.com/publish/post/172159950"
  scheduleAt?: string | Date;
  sendEmail?: boolean;      // default false (web-only publish)
};

function extractPostId(editUrlOrId?: string): string | undefined {
  if (!editUrlOrId) return undefined;
  const m = editUrlOrId.match(/\/publish\/post\/(\d+)/);
  if (m) return m[1];
  if (/^\d+$/.test(editUrlOrId)) return editUrlOrId;
  return undefined;
}

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

    const postId = extractPostId(input.postId ?? input.editUrl);
    if (!postId) throw new Error('publishPost: require postId or editUrl containing /publish/post/{id}');

    const { browser, context } = await openContext();
    try {
      const page = await newPage(context);
      const editUrl = `${env.SUBSTACK_PUBLICATION_URL}/publish/post/${postId}`;

      await retry(() => page.goto(editUrl), { attempts: 3, delayMs: 500 });
      logJson('substack', 'info', { ev: 'publish_open', editUrl });

      // Ensure editor exists
      await page.waitForSelector('body', { state: 'visible', timeout: 10_000 });
      await retry(() => waitForFirstVisible(page, [BODY_EDITOR, ...BODY_EDITOR_FALLBACKS]), { attempts: 3 });

      // Continue → Publish screen
      const continueSel = await retry(
        () => waitForFirstVisible(page, [CONTINUE_BUTTON, ...CONTINUE_BUTTON_FALLBACKS]),
        { attempts: 3, delayMs: 400 },
      );
      logJson('substack', 'info', { ev: 'publish_continue', safeSkip: flags.safeMode, selector: continueSel });
      if (!flags.safeMode) await page.click(continueSel);

      // Delivery: default to web-only (avoid accidental email)
      const sendEmailSel = await retry(
        () => waitForFirstVisible(page, [SEND_EMAIL_CHECKBOX, ...SEND_EMAIL_CHECKBOX_FALLBACKS]),
        { attempts: 2, delayMs: 300 },
      ).catch(() => undefined);
      if (sendEmailSel) {
        logJson('substack', 'info', { ev: 'delivery_set', sendEmail: !!input.sendEmail });
        if (!flags.safeMode) await ensureCheckbox(page, sendEmailSel, !!input.sendEmail);
      }

      // Title testing → OFF
      const titleTestSel = await retry(
        () => waitForFirstVisible(page, [TITLE_TESTING_TOGGLE, ...TITLE_TESTING_TOGGLE_FALLBACKS]),
        { attempts: 2, delayMs: 300 },
      ).catch(() => undefined);
      if (titleTestSel && !flags.safeMode) await ensureCheckbox(page, titleTestSel, false);

      // Optional schedule
      let scheduled = false;
      if (input.scheduleAt) {
        const at = typeof input.scheduleAt === 'string' ? new Date(input.scheduleAt) : input.scheduleAt;
        if (isNaN(at.getTime())) throw new Error('scheduleAt is not a valid date');

        const scheduleToggleSel = await retry(
          () => waitForFirstVisible(page, [SCHEDULE_TOGGLE, ...SCHEDULE_TOGGLE_FALLBACKS]),
          { attempts: 3, delayMs: 400 },
        );
        if (!flags.safeMode) await ensureCheckbox(page, scheduleToggleSel, true);

        // best-effort date/time fill (some UIs use pickers)
        const yyyy = String(at.getFullYear()).padStart(4, '0');
        const mm = String(at.getMonth() + 1).padStart(2, '0');
        const dd = String(at.getDate()).padStart(2, '0');
        const HH = String(at.getHours()).padStart(2, '0');
        const MM = String(at.getMinutes()).padStart(2, '0');

        const dateInput = await page.$(SCHEDULE_DATE_INPUT);
        const timeInput = await page.$(SCHEDULE_TIME_INPUT);
        if (!flags.safeMode) {
          if (dateInput) await dateInput.fill(`${yyyy}-${mm}-${dd}`);
          if (timeInput) await timeInput.fill(`${HH}:${MM}`);
        }

        const confirmSel = await retry(
          () => waitForFirstVisible(page, [SCHEDULE_CONFIRM_PRIMARY, ...SCHEDULE_CONFIRM_FALLBACKS]),
          { attempts: 3, delayMs: 400 },
        );
        logJson('substack', 'info', { ev: 'schedule_confirm', when: at.toISOString(), selector: confirmSel });
        if (!flags.safeMode) await page.click(confirmSel);
        scheduled = true;
      }

      // Publish now (if not scheduled)
      if (!scheduled) {
        const publishSel = await retry(
          () => waitForFirstVisible(page, [PUBLISH_NOW, ...PUBLISH_NOW_FALLBACKS]),
          { attempts: 3, delayMs: 400 },
        );
        logJson('substack', 'info', { ev: 'publish_now_click', safeSkip: flags.safeMode, selector: publishSel });
        if (!flags.safeMode) await page.click(publishSel);
      }

      await page.waitForLoadState('networkidle').catch(() => {});
      const publicUrl = page.url();
      logJson('substack', 'info', { ev: scheduled ? 'scheduled' : 'published', publicUrl });

      appendRun('substack-published', { postId, publicUrl, title: await page.title().catch(() => '') });
      await saveAuthState(context);
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

