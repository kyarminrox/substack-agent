"use server";

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { generateDraft } from "substack-agent/brains/writer";
import { SubstackDriver } from "substack-agent/drivers/substack.driver";

function resolveAuthDir() {
  const fromEnv = process.env.SUBSTACK_AUTH_DIR;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  // default to repo's playwright/.auth from this file location (substack-ui/lib/.. -> repo root)
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "..", "playwright", ".auth");
}

function mkDriver() {
  if (!process.env.SUBSTACK_AUTH_DIR) {
    process.env.SUBSTACK_AUTH_DIR = resolveAuthDir();
  }
  return new SubstackDriver();
}

export async function createDraftAdapter(
  args: { bodyPrompt: string; model?: string },
  report?: (ev: { id: string; phase: string; label: string; status: 'pending' | 'in_progress' | 'success' | 'error'; ts?: number; extra?: Record<string, any> }) => void,
) {
  console.time("createDraftAdapter");
  console.log("tool:createDraft", args);
  try {
    const now = () => Date.now();
    const emit = (ev: { id: string; phase: string; label: string; status: 'pending' | 'in_progress' | 'success' | 'error'; ts?: number; extra?: Record<string, any> }) => {
      if (!report) return;
      report({ ...ev, ts: ev.ts ?? now() });
    };

    emit({ id: 'ai:draft', phase: 'ai', label: 'Generate draft', status: 'in_progress' });
    // Map tool arg -> writer arg. (Passing updateLast/overrideTitle is optional.)
    const { title, html } = await generateDraft({
      topic: args.bodyPrompt,
      model: args.model,
      updateLast: false,
      overrideTitle: false,
    });
    emit({ id: 'ai:draft', phase: 'ai', label: 'Generate draft', status: 'success' });

    emit({ id: 'substack:create', phase: 'substack', label: 'Create draft in Substack', status: 'in_progress' });
    const driver = mkDriver();
    const { id, editUrl } = await driver.createDraft({ title, html });
    emit({ id: 'substack:create', phase: 'substack', label: 'Create draft in Substack', status: 'success', extra: { id, editUrl, title } });
    emit({ id: 'done', phase: 'end', label: 'Draft created', status: 'success', extra: { id, editUrl } });
    return { ok: true, id, editUrl, title };
  } catch (e: any) {
    if (report) report({ id: 'error', phase: 'end', label: 'Error creating draft', status: 'error', extra: { message: e?.message ?? String(e) }, ts: Date.now() });
    return { ok: false, error: e?.message ?? String(e) };
  } finally {
    console.timeEnd("createDraftAdapter");
  }
}

export async function updateLastAdapter(args: {
  title?: string;
  bodyPrompt?: string;
  model?: string;
  mode?: "inplace" | "dup";
}, report?: (ev: { id: string; phase: string; label: string; status: 'pending' | 'in_progress' | 'success' | 'error'; ts?: number; extra?: Record<string, any> }) => void) {
  console.time("updateLastAdapter");
  console.log("tool:updateLast", args);
  try {
    const now = () => Date.now();
    const emit = (ev: { id: string; phase: string; label: string; status: 'pending' | 'in_progress' | 'success' | 'error'; ts?: number; extra?: Record<string, any> }) => {
      if (!report) return;
      report({ ...ev, ts: ev.ts ?? now() });
    };

    const driver = mkDriver();

    // Regenerate body only if bodyPrompt is provided.
    let html: string | undefined;
    if (args.bodyPrompt) {
      emit({ id: 'ai:update', phase: 'ai', label: 'Regenerate body', status: 'in_progress' });
      const res = await generateDraft({
        topic: args.bodyPrompt,
        model: args.model,
        updateLast: true,
        overrideTitle: !!args.title,
      });
      html = res.html;
      emit({ id: 'ai:update', phase: 'ai', label: 'Regenerate body', status: 'success' });
    }

    // Duplicate mode: always create a new draft.
    if (args.mode === "dup") {
      emit({ id: 'substack:dup', phase: 'substack', label: 'Duplicate draft', status: 'in_progress' });
      const { id, editUrl } = await driver.createDraft({
        title: args.title ?? "Untitled",
        html: html ?? "",
      });
      emit({ id: 'substack:dup', phase: 'substack', label: 'Duplicate draft', status: 'success', extra: { id, editUrl } });
      emit({ id: 'done', phase: 'end', label: 'Update complete', status: 'success', extra: { editUrl } });
      return {
        ok: true,
        editUrl,
        duplicated: true,
        titleChanged: !!args.title,
        bodyChanged: !!html,
      };
    }

    // In-place: only send the fields we intend to change to avoid clearing content.
    const payload: { html?: string; title?: string } = {};
    if (html !== undefined) payload.html = html;
    if (args.title) payload.title = args.title;

    // Optional: no-op guard
    if (!payload.html && !payload.title) {
      return { ok: false, error: "Nothing to update: provide title and/or bodyPrompt." };
    }

    emit({ id: 'substack:update', phase: 'substack', label: 'Apply changes', status: 'in_progress' });
    const { editUrl } = await driver.updateLastDraftHtml(payload as any);
    emit({ id: 'substack:update', phase: 'substack', label: 'Apply changes', status: 'success', extra: { editUrl } });
    emit({ id: 'done', phase: 'end', label: 'Update complete', status: 'success', extra: { editUrl } });
    return {
      ok: true,
      editUrl,
      duplicated: false,
      titleChanged: !!args.title,
      bodyChanged: !!html,
    };
  } catch (e: any) {
    if (report) report({ id: 'error', phase: 'end', label: 'Error updating draft', status: 'error', extra: { message: e?.message ?? String(e) }, ts: Date.now() });
    return { ok: false, error: e?.message ?? String(e) };
  } finally {
    console.timeEnd("updateLastAdapter");
  }
}

export async function publishAdapter(args: {
  postId?: string;
  sendEmail?: boolean;
  scheduleAt?: string;
}, report?: (ev: { id: string; phase: string; label: string; status: 'pending' | 'in_progress' | 'success' | 'error'; ts?: number; extra?: Record<string, any> }) => void) {
  console.time("publishAdapter");
  console.log("tool:publish", args);
  try {
    const now = () => Date.now();
    const emit = (ev: { id: string; phase: string; label: string; status: 'pending' | 'in_progress' | 'success' | 'error'; ts?: number; extra?: Record<string, any> }) => {
      if (!report) return;
      report({ ...ev, ts: ev.ts ?? now() });
    };

    const isSchedule = !!args.scheduleAt;
    emit({ id: isSchedule ? 'substack:schedule' : 'substack:publish', phase: 'substack', label: isSchedule ? 'Schedule post' : 'Publish post', status: 'in_progress' });
    const driver = mkDriver();
    const { publicUrl } = await driver.publishPost({
      postId: args.postId,
      sendEmail: args.sendEmail ?? false,
      scheduleAt: args.scheduleAt,
    });
    emit({ id: isSchedule ? 'substack:schedule' : 'substack:publish', phase: 'substack', label: isSchedule ? 'Schedule post' : 'Publish post', status: 'success', extra: { publicUrl } });
    emit({ id: 'done', phase: 'end', label: isSchedule ? 'Scheduled' : 'Published', status: 'success', extra: { publicUrl } });
    return { ok: true, publicUrl };
  } catch (e: any) {
    if (report) report({ id: 'error', phase: 'end', label: 'Error publishing', status: 'error', extra: { message: e?.message ?? String(e) }, ts: Date.now() });
    return { ok: false, error: e?.message ?? String(e) };
  } finally {
    console.timeEnd("publishAdapter");
  }
}
