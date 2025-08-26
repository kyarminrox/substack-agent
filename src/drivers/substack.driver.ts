import type { PlatformDriver } from './platformDriver.js';
import type { PostDraftInput, PublishPostInput, NoteInput, Comment, Stats, StatsRange } from '../types/schemas.js';
import { env, flags } from '../infra/config.js';
import { openContext, newPage, saveAuthState, humanPause } from '../infra/playwright.js';
import { TITLE_INPUT, BODY_EDITOR, PUBLISH_BUTTON } from '../infra/selectors/substack.js';
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
      console.log('Navigated to composer:', composeUrl);
      await humanPause();
      console.log(`Typing title into: ${TITLE_INPUT}`);
      if (flags.safeMode) {
        console.log('SAFE_MODE enabled – skipping title fill');
      } else {
        try {
          await page.fill(TITLE_INPUT, input.title);
        } catch (err) {
          throw new Error('Selector TITLE_INPUT not found – Substack UI may have changed');
        }
      }
      console.log(`Inserting body HTML into: ${BODY_EDITOR}`);
      if (flags.safeMode) {
        console.log('SAFE_MODE enabled – skipping body HTML insertion');
      } else {
        try {
          await page.waitForSelector(BODY_EDITOR);
          await page.evaluate(
            (
              { selector, html }: { selector: string; html: string },
            ) => {
              const el = document.querySelector(selector) as HTMLElement | null;
              if (!el) {
                throw new Error('not found');
              }
              el.innerHTML = html;
            },
            { selector: BODY_EDITOR, html: input.html },
          );
        } catch (err) {
          throw new Error('Selector BODY_EDITOR not found – Substack UI may have changed');
        }
      }
      if (input.tags?.length) {
        console.log('TODO: apply tags', input.tags);
      }
      await humanPause();
      await saveAuthState(context);
      console.log('Saved Substack auth state to:', path.resolve(AUTH_PATH));

      return { id: `draft_${Date.now()}`, editUrl: page.url() };
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
      console.log('Opened composer to publish draft', input.id);
      if (input.scheduleAt) {
        console.log('TODO: schedule publish at', input.scheduleAt);
      }
      console.log('Clicking publish button');
      if (flags.safeMode) {
        console.log('SAFE_MODE enabled – skipping publish click');
      } else {
        try {
          await page.click(PUBLISH_BUTTON);
        } catch (err) {
          throw new Error('Selector PUBLISH_BUTTON not found – Substack UI may have changed');
        }
      }
      await saveAuthState(context);

      console.log('Saved Substack auth state to:', path.resolve(AUTH_PATH));

      return { publicUrl: page.url() };
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
