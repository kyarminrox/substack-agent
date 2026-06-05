# Substack Agent

Open-source AI agent to draft, schedule, publish, cross-post, and manage audience ops across **Substack** (via Playwright) and **Medium** (via API), with a clean driver interface and a review/approval dashboard.
## Status
v0.1 — scaffolding and drivers. See `docs/Project-Requirements.md` for scope and plan.

## Quick Start
```bash
# Node 18+ recommended
npm i
npm run dev
```

Scripts

npm run dev – run the app in TS directly

npm run build – compile TS → JS in dist/

npm start – run compiled app

npm run lint – eslint

npm test – placeholder (vitest)

Project Structure
src/
  brains/           # planner / style memory adapters
  drivers/          # platform drivers: substack, medium, gmail, etc.
  workflows/        # publish_blog, schedule_notes, manage_inbox, ...
  infra/            # queue, logger, config, secrets
  index.ts          # entrypoint

Environment

- `MEDIUM_TOKEN` – Medium API token
- `SUBSTACK_AUTH_DIR` – Playwright auth storage path
- `GROQ_API_KEY` – Groq API key for AI gateway
- See `.env.example`

### Substack (Playwright) setup

Prereqs:

```bash
npx playwright install
npx playwright install-deps
# or:
sudo apt-get install -y libatk1.0-0t64 libatk-bridge2.0-0t64 libcups2t64 libxkbcommon0 \
  libatspi2.0-0t64 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2t64
```

Install deps and run the interactive auth bootstrap.

```bash
npm i
npm run auth:substack # a browser window will open; complete login and press Enter
```

Environment flags:

- `SUBSTACK_HEADLESS` – set to `false` to see the browser window (defaults to `true`).
- `SAFE_MODE` – when `true`, actions are logged and the page still opens, but **Publish** is not clicked.

Selectors used by the Substack driver live in `src/infra/selectors/substack.ts`. If Substack updates their UI, these selectors may need revisions.

Publish nudge behavior

- When publishing web-only (no email), Substack may show a confirmation modal with “Publish on web only” and “Also send via email,” plus an optional “Don’t ask again.” The agent automatically confirms “Publish on web only” to match the default (no `--email`). If you pass `--email`, the driver configures delivery to include email and this nudge should not appear.

Runs & Artifacts

- JSONL runs: the agent writes append-only logs to `playwright/.runs/*.jsonl` (e.g., `substack-drafts.jsonl`, `substack-published.jsonl`). Each line is a single JSON event for easy parsing and audit.
- Screenshots: publish flow saves debug images to `playwright/.runs/*.png` (e.g., `pre-publish-*.png`, `post-publish-*.png`). These help verify the visible state before/after publish.
- Git hygiene: `.gitignore` excludes these files to avoid committing local artifacts.

### Demos

```bash
# interactive login
npm run auth:substack

# create a draft
npm run demo:substack:draft -- "Test Title" "<h1>Body</h1>"

# publish an existing draft
SUBSTACK_PUBLICATION_URL=https://yourpub.substack.com npm run demo:substack:publish -- draft_123

# Publish the latest draft (web-only, no email)
npm run demo:substack:publish

# Publish a specific draft (web-only)
npm run demo:substack:publish -- 172159950

# Publish + email
npm run demo:substack:publish -- 172159950 --email

### Schedule a post (web-only)

```bash
SUBSTACK_HEADLESS=false SAFE_MODE=false \
npm run demo:substack:schedule -- <postId> --schedule "YYYY-MM-DDTHH:MM:00"

# Schedule instead of publish now (web-only)
npm run demo:substack:publish -- 172159950 --schedule "2025-09-01T09:00"
```

```bash
# AI draft (Groq default)

GROQ_API_KEY=sk_... AI_PROVIDER=groq npm run agent:substack:write -- "Topic"

AI_PROVIDER=groq npm run agent:substack:write -- "Topic"


# Local stub (no external calls)
npm run agent:substack:write -- "Offline draft" --model local
```

Behavior:
- The agent writer uses a pluggable AI gateway (Groq recommended).
- All created drafts are appended as JSONL to `playwright/.runs/substack-drafts.jsonl`.


Set `SAFE_MODE=true` to log actions without modifying Substack.
Set `SAFE_MODE=false` to attempt real actions (authentication required).

Selectors are maintained in `src/infra/selectors/substack.ts`. If Substack changes their UI, update selectors there.

**Proxy / Troubleshooting:** Behind a proxy? Set `HTTPS_PROXY`/`HTTP_PROXY` env vars. You can also configure Playwright's proxy in code via `chromium.launch({ proxy: { server: 'http://your-proxy:8080' }})`. If installs fail, run `npx playwright install` and `npx playwright install-deps` again.

> Medium API: You can create DRAFT or PUBLIC posts, but you cannot "publish a draft later" via API. If you need a draft for review, create with `publishStatus = draft` and publish manually in Medium, or create a PUBLIC post directly when ready.

Never commit auth cookies or tokens.

### Medium draft demo
```bash
# set MEDIUM_TOKEN in .env
npm run demo:medium:draft -- "My Title" "<h1>Hi</h1><p>Body</p>" "https://your-substack-post" "ai,automation"
```

License

MIT

## Substack UI chat + tools (ai@5 + Groq)

This repo also contains a minimal Next.js app under `substack-ui/` that exposes a chat endpoint with tool-calling to automate Substack drafting end‑to‑end.

Key points (what finally made it work reliably):

- Single tool definition, in one place: `substack-ui/app/api/chat/route.ts`.
- ai@5 requires `inputSchema` for tools; do not use `parameters`.
- Use a permissive schema for provider compatibility:
  - `inputSchema: z.record(z.any())` for `write_draft` so the provider never rejects on extra keys.
  - Validate and normalize inside `execute` (unwrap `rawArgs.input ?? rawArgs`, accept `bodyPrompt|prompt|topic|text|query`).
- Provider repair: if a model emits `{ bodyPrompt }` at the top level, an `experimental_repairToolCall` hook wraps it into `{ input: { bodyPrompt } }`.
- Messages are always converted: `messages: convertToModelMessages(messages)`.
- System hint steers the correct argument name: “put the user’s prompt under key bodyPrompt (not topic).”

Environment that must be set for Groq-backed writing:

- In `substack-ui/.env.local`:
  - `GROQ_API_KEY=...`
  - `GROQ_MODEL=meta-llama/llama-4-scout-17b-16e-instruct` (or any Groq model you prefer)
  - `AI_PROVIDER=groq` (crucial: ensures the writer uses Groq instead of the local stub)

Run order (avoid stale modules):

```
npm run build
cd substack-ui && npm run dev
```

Expected logs when working:

- Chat: `[chat] ... tools= [ 'write_draft', ... ]`
- Tool schema: `write_draft.inputSchema isZodSafeParse = true`
- Writer: `{"ch":"ai", "provider":"groq", "prompt": ...}`
- Substack driver: `compose_opened`, `title_fill`, `body_insert`, `draft_created`.

Common pitfalls + fixes:

- Provider rejects with “additionalProperties ... not allowed” → switch to `inputSchema` and use a permissive Zod (as above). Do not use `parameters` with strict JSON.
- Tool defined in multiple files → remove duplicates; only `route.ts` should export the tools object used by `streamText`.
- Writer inserts “Local stub ...” → set `AI_PROVIDER=groq` in `substack-ui/.env.local` so `src/infra/gateway.ts` resolves GroqProvider.

### Extending tools (update, publish, schedule)

- `update_last`: already implemented. Its `inputSchema` accepts `{ title?, bodyPrompt?, model?, mode? }`. In `execute`, call `updateLastAdapter` (it regenerates HTML if `bodyPrompt` is provided; supports in-place vs duplicate).
- `publish`: already implemented. Accepts `{ postId?, sendEmail?, scheduleAt? }`. The driver defaults to web-only unless `sendEmail=true`.
- Add new tool: keep it in `route.ts`, define a Zod `inputSchema`, normalize args in `execute`, and delegate to a server adapter in `substack-ui/lib/agent-bridge.ts`.
