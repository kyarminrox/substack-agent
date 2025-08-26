import type { PlatformDriver } from './platformDriver.js';
import type { PostDraftInput, PublishPostInput, NoteInput, Comment, Stats, StatsRange } from '../types/schemas.js';
import { env } from '../infra/config.js';

export class SubstackDriver implements PlatformDriver {
  readonly name = 'substack';

  async ensureAuth(): Promise<void> {
    // Will use Playwright persisted auth later; for now just check the dir is set
    if (!env.SUBSTACK_AUTH_DIR) {
      throw new Error('SUBSTACK_AUTH_DIR not configured');
    }
  }

  async createDraft(_input: PostDraftInput): Promise<{ id: string; editUrl?: string }> {
    // TODO: implement via Playwright
    throw new Error('Not implemented: SubstackDriver.createDraft');
  }

  async publishPost(_input: PublishPostInput): Promise<{ publicUrl: string }> {
    // TODO: implement via Playwright
    throw new Error('Not implemented: SubstackDriver.publishPost');
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
