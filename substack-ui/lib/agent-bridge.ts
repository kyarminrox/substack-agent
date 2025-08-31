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

export async function createDraftAdapter(args: { bodyPrompt: string; model?: string }) {
  console.time("createDraftAdapter");
  console.log("tool:createDraft", args);
  try {
    // Map tool arg -> writer arg. (Passing updateLast/overrideTitle is optional.)
    const { title, html } = await generateDraft({
      topic: args.bodyPrompt,
      model: args.model,
      updateLast: false,
      overrideTitle: false,
    });
    const driver = mkDriver();
    const { id, editUrl } = await driver.createDraft({ title, html });
    return { ok: true, id, editUrl, title };
  } catch (e: any) {
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
}) {
  console.time("updateLastAdapter");
  console.log("tool:updateLast", args);
  try {
    const driver = mkDriver();

    // Regenerate body only if bodyPrompt is provided.
    let html: string | undefined;
    if (args.bodyPrompt) {
      const res = await generateDraft({
        topic: args.bodyPrompt,
        model: args.model,
        updateLast: true,
        overrideTitle: !!args.title,
      });
      html = res.html;
    }

    // Duplicate mode: always create a new draft.
    if (args.mode === "dup") {
      const { id, editUrl } = await driver.createDraft({
        title: args.title ?? "Untitled",
        html: html ?? "",
      });
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

    const { editUrl } = await driver.updateLastDraftHtml(payload as any);
    return {
      ok: true,
      editUrl,
      duplicated: false,
      titleChanged: !!args.title,
      bodyChanged: !!html,
    };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  } finally {
    console.timeEnd("updateLastAdapter");
  }
}

export async function publishAdapter(args: {
  postId?: string;
  sendEmail?: boolean;
  scheduleAt?: string;
}) {
  console.time("publishAdapter");
  console.log("tool:publish", args);
  try {
    const driver = mkDriver();
    const { publicUrl } = await driver.publishPost({
      postId: args.postId,
      sendEmail: args.sendEmail ?? false,
      scheduleAt: args.scheduleAt,
    });
    return { ok: true, publicUrl };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  } finally {
    console.timeEnd("publishAdapter");
  }
}
