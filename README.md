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

Never commit auth cookies or tokens.

License

MIT
