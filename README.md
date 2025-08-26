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

### Demos

```bash
# interactive login
npm run auth:substack

# create a draft
npm run demo:substack:draft -- "Test Title" "<h1>Body</h1>"

# publish an existing draft
SUBSTACK_PUBLICATION_URL=https://yourpub.substack.com npm run demo:substack:publish -- draft_123
```


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
