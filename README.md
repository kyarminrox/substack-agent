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
- `SAFE_MODE` – when `true`, publish actions are logged but not executed; the page still opens but the Publish button isn't clicked (defaults to `false`).

Selectors in the Substack driver are currently TODO; the skeleton logs the intended steps and will be refined with screenshots in future iterations.

### Demos

```bash
# interactive login
npm run auth:substack

# create a draft (flip SAFE_MODE=true in .env to avoid accidental actions)
npm run demo:substack draft "My Title" "<h1>Hello</h1><p>Body</p>"

# publish now (SAFE_MODE=true will open the page but skip clicking Publish)
SUBSTACK_PUBLICATION_URL=https://yourpub.substack.com npm run demo:substack publish
```


> Medium API: You can create DRAFT or PUBLIC posts, but you cannot "publish a draft later" via API. If you need a draft for review, create with `publishStatus = draft` and publish manually in Medium, or create a PUBLIC post directly when ready.

Never commit auth cookies or tokens.

### Medium draft demo
```bash
# set MEDIUM_TOKEN in .env
npm run demo:medium:draft -- "My Title" "<h1>Hi</h1><p>Body</p>" "https://your-substack-post" "ai,automation"
```

License

MIT
