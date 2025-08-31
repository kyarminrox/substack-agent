import { z } from "zod";

/**
 * Accept bodyPrompt OR topic plus optional title/model/mode; normalize to { bodyPrompt?, ... }.
 */
export const updateLastSchema = z
  .object({
    title: z.string().optional(),
    bodyPrompt: z.string().min(1).optional(),
    topic: z.string().min(1).optional(),
    model: z.string().optional(),
    mode: z.enum(["inplace", "dup"]).optional(),
  })
  .transform((v) => ({
    title: v.title,
    bodyPrompt: v.bodyPrompt ?? v.topic,
    model: v.model,
    mode: v.mode,
  }));

export const publishSchema = z.object({
  postId: z.string().optional(),
  sendEmail: z.boolean().optional(),
  scheduleAt: z.string().optional(), // ISO8601 if set
});
