import { z } from 'zod';

export const StatsRangeSchema = z.enum(['7d', '30d', '90d']);
export type StatsRange = z.infer<typeof StatsRangeSchema>;

export const PostDraftInputSchema = z.object({
  title: z.string().min(1),
  html: z.string().min(1),
  tags: z.array(z.string()).optional(),
  canonicalUrl: z.string().url().optional(),
});
export type PostDraftInput = z.infer<typeof PostDraftInputSchema>;

export const PublishPostInputSchema = z.object({
  id: z.string().min(1),
  scheduleAt: z.string().datetime().optional(), // ISO; immediate if absent
  sendEmail: z.boolean().optional(),
});
export type PublishPostInput = z.infer<typeof PublishPostInputSchema>;

export const NoteInputSchema = z.object({
  text: z.string().min(1),
  media: z.array(z.string()).optional(),
  scheduleAt: z.string().datetime().optional(),
});
export type NoteInput = z.infer<typeof NoteInputSchema>;

export const CommentSchema = z.object({
  id: z.string(),
  author: z.string(),
  text: z.string(),
  url: z.string().url(),
});
export type Comment = z.infer<typeof CommentSchema>;

export const PublishResultSchema = z.object({
  publicUrl: z.string().url(),
  platformPostId: z.string().optional(),
});
export type PublishResult = z.infer<typeof PublishResultSchema>;

export const StatsSchema = z.object({
  views: z.number().nonnegative(),
  subs: z.number().nonnegative(),
  ctr: z.number().nonnegative().optional(),
});
export type Stats = z.infer<typeof StatsSchema>;
