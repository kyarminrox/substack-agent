import type { PlatformDriver } from './platformDriver.js';
import type { PostDraftInput, PublishPostInput, NoteInput, Comment, Stats, StatsRange } from '../types/schemas.js';
import { env, flags } from '../infra/config.js';
import { openContext, newPage, saveAuthState, humanPause } from '../infra/playwright.js';
import {
  TITLE_INPUT,
  TITLE_INPUT_FALLBACKS,
  BODY_EDITOR,
  BODY_EDITOR_FALLBACKS,
  PUBLISH_BUTTON,
  PUBLISH_BUTTON_FALLBACKS,
  waitForFirstVisible,
} from '../infra/selectors/substack.js';
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
        ? `${env.SUBSTACK_PUBLICATION_URL}/publish`
        : `${env.SUBSTACK_BASE_URL}/publish`;
      await page.goto(composeUrl);
      await page.waitForLoadState('domcontentloaded');
      try {
        await page.waitForLoadState('networkidle');
      } catch {
        // ignore quick timeout
      }
      await page.waitForSelector('body', { state: 'visible', timeout: 10_000 });
      const titleSel = await waitForFirstVisible(page, [
        TITLE_INPUT,
        ...TITLE_INPUT_FALLBACKS,
      ]);
      const bodySel = await waitForFirstVisible(page, [
        BODY_EDITOR,
        ...BODY_EDITOR_FALLBACKS,
      ]);
      console.log('Navigated to composer:', composeUrl);
      await humanPause();
      console.log(`Typing title into: ${titleSel}`);
      if (flags.safeMode) {
        console.log('SAFE_MODE – skipping title fill');
      } else {
        await page.fill(titleSel, input.title);
      }
      console.log(`Inserting body HTML into: ${bodySel}`);
      if (flags.safeMode) {
        console.log('SAFE_MODE – skipping body HTML insertion');
        console.log('SAFE_MODE – skipping editor verification');
      } else {
        await page.focus(bodySel);
        try {
          await page.evaluate(async (html) => {
            await navigator.clipboard.writeText(html);
          }, input.html);
          await page.keyboard.press('Control+V');
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn('Clipboard unavailable, falling back to typing:', msg);
          await page.type(bodySel, input.html.replace(/<[^>]+>/g, ''));
        }
        await page.waitForFunction(
          (sel) => !!document.querySelector(sel)?.textContent?.trim(),
          bodySel,
          { timeout: 5000 },
        );
        console.log('Editor content verified');
      }
      if (input.tags?.length) {
        console.log('TODO: apply tags', input.tags);
      }
      const id = `draft_${Date.now()}`;
      const editUrl = page.url();
      console.log('Draft created', id, editUrl);
      await humanPause();
      await saveAuthState(context);
      console.log('Saved Substack auth state to:', path.resolve(AUTH_PATH));

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
      const composeUrl = `${env.SUBSTACK_PUBLICATION_URL}/publish`;
      await page.goto(composeUrl);
      await page.waitForLoadState('domcontentloaded');
      try {
        await page.waitForLoadState('networkidle');
      } catch {
        // ignore
      }
      await page.waitForSelector('body', { state: 'visible', timeout: 10_000 });
      const publishSel = await waitForFirstVisible(page, [
        PUBLISH_BUTTON,
        ...PUBLISH_BUTTON_FALLBACKS,
      ]);
      console.log('Opened composer to publish draft', input.id);
      if (input.scheduleAt) {
        console.log('TODO: schedule publish at', input.scheduleAt);
      }
      console.log('Clicking publish button via', publishSel);
      if (flags.safeMode) {
        console.log('SAFE_MODE – skipping publish click');
      } else {
        await page.click(publishSel);
        await page.waitForTimeout(500);
      }
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
