## Overview
The repository provides AI agents to automate Substack via Playwright and Medium via API. Workflows can orchestrate these drivers for end-to-end publishing.

## Prerequisites
- Node 18+
- Playwright browsers installed with `npx playwright install` and `npx playwright install-deps` for Linux
- Substack auth via `npm run auth:substack`
- Medium auth via `MEDIUM_TOKEN` in `.env`

## Environment Setup
Create a `.env` file using this template:
```bash
SUBSTACK_AUTH_DIR=playwright/.auth
SUBSTACK_BASE_URL=https://substack.com
SUBSTACK_PUBLICATION_URL=
SUBSTACK_HEADLESS=true
SAFE_MODE=false
MEDIUM_TOKEN=
GROQ_API_KEY=
```
- `SAFE_MODE` enables log-only mode to avoid writes.
- `SUBSTACK_HEADLESS` controls whether Playwright runs without a browser UI.

## Running the agents
- Interactive login: `npm run auth:substack`
- Create draft: `SAFE_MODE=true npm run demo:substack:draft -- "Title" "<h1>Body</h1>"`
- Publish draft: `SUBSTACK_PUBLICATION_URL=https://yourpub.substack.com npm run demo:substack:publish -- draft_123`
- Medium draft: `npm run demo:medium:draft -- "My Title" "<h1>Hi</h1><p>Body</p>" "https://your-substack-post" "ai,automation"`

## Development conventions
- Selectors live in `src/infra/selectors/substack.ts`; update only that file if the Substack UI changes.
- Always resolve selectors via `waitForFirstVisible`.
- Use a single Playwright context with clipboard permissions.
- `SAFE_MODE` must skip fills/publish clicks but still navigate/select.
- Attempt clipboard paste first, and fallback to typing plaintext on error.

## Troubleshooting
- Playwright install failures → rerun install commands.
- Corporate proxies → set `HTTPS_PROXY`/`HTTP_PROXY` or configure `chromium.launch({ proxy })`.
- Missing auth → rerun `npm run auth:substack`.
- Debugging → set `SUBSTACK_HEADLESS=false`.

## Development checklist
- Lint passes
- Build passes
- Demos work in SAFE_MODE
- Selector changes isolated to selectors file
- No duplicate logs/actions

## AI Providers
- **local** – default stub, no external calls.
- **groq** (recommended) – ultra-fast, free tier, tool-use models:
  - `llama3-groq-70b-tool-use-preview`
  - `llama3-groq-8b-tool-use-preview`
- **openai** – stub (future).
- **claude** – stub (future).

Configuration:
- Set `AI_PROVIDER=groq` to use Groq by default.
- Override per run with `--model groq`.


### Groq setup
- Install SDK: `npm install groq-sdk`
- Require `GROQ_API_KEY` in `.env`
- Models: `llama3-groq-70b-tool-use-preview`, `llama3-groq-8b-tool-use-preview`

## Tool‑Calling (ai@5) – What we learned

- Define tools once in `substack-ui/app/api/chat/route.ts`.
- Use `inputSchema` (Zod) with ai@5 instead of `parameters`.
- Prefer permissive schemas for provider compatibility (`z.record(z.any())` for write paths). Validate inside `execute`.
- Normalize shapes (`rawArgs.input ?? rawArgs`), accept `bodyPrompt|prompt|topic|text|query`.
- Always call `convertToModelMessages(messages)` before passing to the model.
- Add a system hint: “When drafting, call tool write_draft and put the user’s prompt under key bodyPrompt (not topic).”
- Optional `experimental_repairToolCall` can wrap `{ bodyPrompt }` → `{ input: { bodyPrompt } }` if a provider emits a strict variant.

### Writer provider selection

- The writer resolves its provider in `src/infra/gateway.ts`.
- Set `AI_PROVIDER=groq` (in `substack-ui/.env.local`) + `GROQ_API_KEY` + `GROQ_MODEL` to ensure Groq is used instead of the local stub.
- Symptom when misconfigured: editor body contains “Local stub for: Topic …” instead of generated paragraphs.

### Debug checklist

- Route logs: `write_draft.inputSchema isZodSafeParse = true`.
- Writer logs: `{ provider: 'groq', prompt: ... }`.
- Substack driver logs: `compose_opened`, `title_fill`, `body_insert`, `draft_created` with an `editUrl`.

