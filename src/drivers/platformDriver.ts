import type { PostDraftInput, PublishPostInput, NoteInput, Comment, Stats, StatsRange } from '../types/schemas.js';

export interface PlatformDriver {
  readonly name: 'substack' | 'medium' | string;

  ensureAuth(): Promise<void>;

  // Publishing
  createDraft(input: PostDraftInput): Promise<{ id: string; editUrl?: string }>;
  publishPost(input: PublishPostInput): Promise<{ publicUrl: string }>;

  // Notes / short posts
  createNote(input: NoteInput): Promise<{ url?: string }>;

  // Audience & messages
  listComments(params: { since?: string }): Promise<Comment[]>;
  replyToComment(input: { commentId: string; text: string }): Promise<void>;

  // Insights
  getStats(params: { range: StatsRange }): Promise<Stats>;
}
