import type { PlatformDriver } from './platformDriver.js';
import type { PostDraftInput, PublishPostInput, NoteInput, Comment, Stats, StatsRange } from '../types/schemas.js';
import { env, flags } from '../infra/config.js';
import { openContext, newPage, saveAuthState, humanPause } from '../infra/playwright.js';

export class SubstackDriver implements PlatformDriver {
  readonly name = 'substack';

  async ensureAuth(): Promise<void> {
    if (!env.SUBSTACK_AUTH_DIR) {
      throw new Error('SUBSTACK_AUTH_DIR not configured');
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
      console.log('Setting title (TODO selector):', input.title);
      console.log('Inserting body HTML (TODO)');
      if (input.tags?.length) {
        console.log('TODO: apply tags', input.tags);
      }
      await humanPause();
      await saveAuthState(context);
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
      if (flags.safeMode) {
        console.log('SAFE_MODE enabled - skipping publish');
      } else {
        console.log('TODO: click Publish');
      }
      await saveAuthState(context);
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
