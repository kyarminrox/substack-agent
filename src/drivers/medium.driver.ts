import type { PlatformDriver } from './platformDriver.js';
import type { PostDraftInput, PublishPostInput, NoteInput, Comment, Stats, StatsRange } from '../types/schemas.js';
import { env } from '../infra/config.js';

import { getMe, createPost } from './medium.api.js';


export class MediumDriver implements PlatformDriver {
  readonly name = 'medium';

  async ensureAuth(): Promise<void> {
    if (!env.MEDIUM_TOKEN) {
      throw new Error('MEDIUM_TOKEN not configured');
    }
  }

  async createDraft(input: PostDraftInput): Promise<{ id: string; editUrl?: string }> {
    await this.ensureAuth();
    const me = await getMe();
    const r = await createPost({
      userId: me.data.id,
      title: input.title,
      content: input.html,
      tags: input.tags,
      canonicalUrl: input.canonicalUrl,
      publishStatus: 'draft',
      notifyFollowers: false,
    });
    return { id: r.data.id, editUrl: r.data.url };
  }

  async publishPost(_input: PublishPostInput): Promise<{ publicUrl: string }> {
    throw new Error('Medium API does not support publishing an existing draft via API. Create a public post directly instead.');

  async createDraft(_input: PostDraftInput): Promise<{ id: string; editUrl?: string }> {
    // TODO: implement via Medium API
    throw new Error('Not implemented: MediumDriver.createDraft');
  }

  async publishPost(_input: PublishPostInput): Promise<{ publicUrl: string }> {
    // TODO: implement via Medium API
    throw new Error('Not implemented: MediumDriver.publishPost');

  }

  async createNote(_input: NoteInput): Promise<{ url?: string }> {
    // Medium has no Notes; could map to story or skip
    throw new Error('Not implemented: MediumDriver.createNote');
  }

  async listComments(_params: { since?: string }): Promise<Comment[]> {
    // Medium comments may need scraping or API (limited)
    throw new Error('Not implemented: MediumDriver.listComments');
  }

  async replyToComment(_input: { commentId: string; text: string }): Promise<void> {
    throw new Error('Not implemented: MediumDriver.replyToComment');
  }

  async getStats(_params: { range: StatsRange }): Promise<Stats> {
    throw new Error('Not implemented: MediumDriver.getStats');
  }
}
