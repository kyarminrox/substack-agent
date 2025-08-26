# Substack Agent

AI agent to draft, schedule, publish, cross-post, and manage audience ops across **Substack** (via Playwright) and **Medium** (via API), with a clean driver interface and a review/approval dashboard.

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
- See `.env.example`

> Medium API: You can create DRAFT or PUBLIC posts, but you cannot "publish a draft later" via API. If you need a draft for review, create with `publishStatus = draft` and publish manually in Medium, or create a PUBLIC post directly when ready.

Never commit auth cookies or tokens.

### Medium draft demo
```bash
# set MEDIUM_TOKEN in .env
npm run demo:medium:draft -- "My Title" "<h1>Hi</h1><p>Body</p>" "https://your-substack-post" "ai,automation"
```

License

MIT
