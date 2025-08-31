# Substack UI

Minimal Next.js chat UI that drives the existing Substack automation in `../src`.

## Env

Create `substack-ui/.env.local` with:

```
GROQ_API_KEY=YOUR_KEY
SUBSTACK_PUBLICATION_URL=https://yourpub.substack.com
SUBSTACK_AUTH_DIR=./playwright/.auth
```

Server code reads these from `process.env`. When running locally under the Next dev server, the auth dir defaults to `../playwright/.auth` if not provided.

## Install & Run

```
cd substack-ui
npm install
npm run dev
```

### IMPORTANT (workspaces)

Run these once from the repo root after changing workspaces or the agent:

```
npm install
npm run build
```

Then start the UI:

```
cd substack-ui
npm run dev
```

## Test Checklist

- POST actually hits `/api/chat` (see server logs)
- No `GET /?` requests when submitting the form
- Streamed responses render incrementally with a "Streaming…" indicator
- Tool result JSON blocks appear under the assistant message
- Errors render as a short red message

### Quick Verification

- Visit http://localhost:3000 and send: "draft a new substack post on the current recession fears..."
- Server logs show `[chat] POST /api/chat model=... tools=...` and `[tool] ... elapsedMs=...`
- Open http://localhost:3000/api/health and confirm `agentPackage: true` and `authDirExists: true`.

## Try in the chat

- "draft a new substack post on the current recession fears and the leading causes"
- "rename the title to ‘The Fear Premium: Recession Headlines vs. Reality’"
- "schedule it for tomorrow at 9:30am web-only"

## Notes

- Tools call directly into `generateDraft` and `SubstackDriver` – no UI duplication of logic.
- Default publish behavior is web-only (`sendEmail=false`).
- Errors from tools appear as `{ ok:false, error }` blocks in the chat transcript.
- If path resolution is off in dev, set `SUBSTACK_AUTH_DIR` explicitly to the repo-root `playwright/.auth` directory.
