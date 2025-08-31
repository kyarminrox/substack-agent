import { streamText, tool, convertToModelMessages } from "ai";
import { createGroq } from "@ai-sdk/groq";
import { z } from "zod";
import { updateLastSchema, publishSchema } from "@/lib/tools";
import { createDraftAdapter, updateLastAdapter, publishAdapter } from "@/lib/agent-bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const groq = createGroq({ apiKey: process.env.GROQ_API_KEY! });

const system = `
You are a Substack production assistant.
- When the user asks to draft, update, or publish/schedule, call TOOLS.
- When drafting, call tool write_draft and put the user's prompt under key input.bodyPrompt (not topic).
- When calling write_draft or update_last, prefer the param name "bodyPrompt" (but "topic" is also accepted).
- Default to web-only (sendEmail=false) unless explicitly told otherwise.
- Keep confirmations short and include returned URLs.
`;

export async function POST(req: Request) {
  // Parse useChat body and convert UI messages → core/model messages
  const body = (await req.json().catch(() => ({} as any))) as any;
  const uiMessages = Array.isArray(body?.messages) ? body.messages : [];

  // Preflight: environment
  if (!process.env.GROQ_API_KEY) {
    console.error("[chat] missing GROQ_API_KEY in environment");
    return new Response(JSON.stringify({ ok: false, error: "Missing GROQ_API_KEY" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  const modelId = process.env.GROQ_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct";
  const model = groq(modelId);

  // Local validator: require bodyPrompt; allow extras.
  const WriteDraftParamsZ = z
    .object({
      bodyPrompt: z.string().min(1, "bodyPrompt is required"),
      model: z.string().optional(),
    })
    .passthrough();

  // Provider-facing JSON schema: explicitly permissive.
  // For provider-facing schema, let the SDK derive JSON from Zod below.
  // We will use inputSchema with a permissive Zod to avoid strict provider validation.

  // Wrap adapters to log timing + args
  const wrap = <T extends Record<string, any>, R>(name: string, exec: (args: T) => Promise<R>) =>
    async (args: T) => {
      const t0 = Date.now();
      const safeArgs: any = { ...args };
      for (const k of Object.keys(safeArgs)) {
        const v = safeArgs[k];
        if (typeof v === "string" && v.length > 200) safeArgs[k] = `${v.slice(0, 200)}... (${v.length} chars)`;
      }
      try {
        const res = await exec(args);
        console.log("[tool]", name, "args=", safeArgs, "elapsedMs=", Date.now() - t0);
        return res;
      } catch (e) {
        console.log("[tool]", name, "error=", (e as any)?.message || String(e), "elapsedMs=", Date.now() - t0);
        throw e;
      }
    };

  const tools = {
    write_draft: (tool as any)({
      description:
        "Create a new Substack draft. Put the topic/prompt under key `bodyPrompt` (NOT `topic`). Optional `model`.",
      // IMPORTANT: Use inputSchema with a permissive Zod so provider doesn't reject.
      inputSchema: z.record(z.any()),
      async execute(rawArgs: any) {
        const a: any = (rawArgs as any)?.input ?? rawArgs ?? {};
        const bodyPrompt: any =
          a?.bodyPrompt ??
          a?.prompt ??
          a?.topic ??
          a?.text ??
          a?.query ??
          a?.args?.bodyPrompt ??
          a?.input?.bodyPrompt;
        const model: any = a?.model ?? a?.input?.model;
        console.log("[tools] write_draft args (normalized)", { bodyPrompt, model, raw: rawArgs });
        const parsed = WriteDraftParamsZ.safeParse({ bodyPrompt, model });
        if (!parsed.success) {
          console.error("[tools] write_draft args invalid", parsed.error.flatten());
          return { ok: false, error: "Invalid write_draft params" };
        }
        return createDraftAdapter(parsed.data as { bodyPrompt: string; model?: string });
      },
    }),
    update_last: (tool as any)({
      description: "Update the latest draft (inplace or duplicate).",
      inputSchema: updateLastSchema,
      execute: wrap("update_last", updateLastAdapter),
    }),
    publish: (tool as any)({
      description: "Publish or schedule the draft (web-only by default).",
      inputSchema: publishSchema,
      execute: wrap("publish", publishAdapter),
    }),
  } as const;

  console.log("[chat] POST /api/chat model=", modelId, "tools=", Object.keys(tools));
  const messagesForModel = convertToModelMessages(uiMessages);
  console.log(
    "[chat] first user message ->",
    messagesForModel.find((m: any) => m.role === "user")
  );
  console.log(
    "[chat] write_draft.inputSchema isZodSafeParse =",
    typeof (tools.write_draft as any).inputSchema?.safeParse === "function"
  );
  console.log("[chat] write_draft.inputSchema dump =", (tools.write_draft as any).inputSchema);

  const result = await streamText({
    model,
    system,
    messages: messagesForModel,
    tools,
    toolChoice: "auto",
    // Fallback: try to repair invalid tool calls by wrapping top-level args.
    experimental_repairToolCall: async ({ toolCall, error }) => {
      try {
        if (!error || typeof error !== "object") return null;
        // If model sent { bodyPrompt } at top-level, wrap into { input: { bodyPrompt } }
        const input = (toolCall as any)?.input;
        if (toolCall.toolName === "write_draft" && input && typeof input === "object") {
          const hasTopLevelBody = Object.prototype.hasOwnProperty.call(input, "bodyPrompt");
          const hasInputNested = input && typeof input?.input === "object" && "bodyPrompt" in input.input;
          if (hasTopLevelBody && !hasInputNested) {
            const wrapped = { input: { bodyPrompt: input.bodyPrompt, model: (input as any)?.model } };
            return { ...toolCall, input: JSON.stringify(wrapped) };
          }
        }
      } catch {}
      return null;
    },
  });

  return result.toUIMessageStreamResponse();
}
