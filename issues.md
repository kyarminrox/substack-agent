# Upcoming Issues / Enhancements

This list captures follow‑ups and future features. Each item includes a brief scope and acceptance criteria.

## 1) Improve update_last ergonomics
- Scope: Allow `mode` to default to `inplace`, document `dup` flow in the UI, add clear confirmations.
- Criteria:
  - `update_last` with only `bodyPrompt` regenerates body in place and returns `editUrl`, `{ titleChanged: false, bodyChanged: true }`.
  - `mode=dup` creates a new draft, preserves original.

## 2) Schedule via publish tool
- Scope: Support `scheduleAt` ISO strings (local time accepted), validate and convert to the Substack composer.
- Criteria:
  - `publish` with `scheduleAt` sets a scheduled time in Substack and returns `{ ok: true, publicUrl?: string }`.
  - SAFE_MODE logs actions without committing the schedule.

## 3) Email delivery toggle
- Scope: Add `sendEmail: boolean` to `publish` tool input and pass through to the driver.
- Criteria:
  - `publish` with `sendEmail=true` configures Substack to email subscribers.
  - Default remains web‑only unless explicitly true.

## 4) Tool schema tightening (post‑stabilization)
- Scope: Once provider/tool behavior is stable, replace `z.record(z.any())` with a minimally strict Zod object for `write_draft`.
- Criteria:
  - No provider errors; `additionalProperties` issues do not reappear.
  - Local validation continues to accept `{ bodyPrompt, model? }` only.

## 5) Multi‑turn chat polish
- Scope: Show assistant text before tool results (if any), and render links to `editUrl` inline.
- Criteria:
  - UI displays a compact “Draft created” card with title and clickable editor URL.

## 6) Gateway retries and error surfaces
- Scope: Improve retry policies and expose friendly error messages on common Groq errors (rate limit, invalid model).
- Criteria:
  - Non‑retryable errors surfaced immediately with a helpful message.
  - Retryable errors limited to a sensible backoff window.

## 7) Unit tests for adapters
- Scope: Add light tests around `createDraftAdapter` and `updateLastAdapter` using Playwright fixtures/mocks.
- Criteria:
  - Mocks verify expected payload shapes and success/error flows.

## 8) Docs: driver selectors
- Scope: Anchor docs for the single source of truth for Substack selectors in `src/infra/selectors/substack.ts` and how to update them.
- Criteria:
  - Readme section links directly to the file with a short “how to update” guide.

## 9) Steps / Progress UI (+ tabs)
- Scope: Upgrade `substack-ui` to a tabbed interface (Answer | Steps | Logs). Stream live progress as steps while drafting/publishing.
- Design:
  - Tabs across the top; Answer shows assistant text + tool results cards; Steps shows a timeline grouped by phase (AI writing, Substack actions); Logs shows raw JSON for debugging.
- Server:
  - Switch route to `createUIMessageStream` and `createUIMessageStreamResponse`.
  - Emit `data-step` parts at each milestone: `{ id, phase, label, status: 'pending|in_progress|success|error', ts }`.
  - Merge with `streamText().toUIMessageStream()` so LLM output still streams.
- Client:
  - `useChat({ onData })` updates a Steps store for transient parts; also render persistent `data-step` parts from `message.parts`.
  - Timeline component renders chips (phase), dot indicators for status, and collapsible detail.
- Criteria:
  - While drafting, user sees “Open composer → Fill title → Insert body → Verify content → Save draft” advancing in real time.
  - On completion, Steps shows all green checks and “Draft created” card in Answer tab.

## 10) Transient toasts + progress bar
- Scope: Use transient `data-notification` parts to show toasts and a top progress bar during long operations.
- Criteria:
  - Toasts for “Opening Substack”, “Inserting content”, “Saving draft”.
  - Progress bar reaches 100% on `draft_created`.

## 11) UI component library & theming
- Scope: Adopt shadcn/ui + Tailwind to modernize layout (cards, tabs, timeline, toasts), add dark/light theme.
- Criteria:
  - New UI launched with tabs; responsive layout; copy buttons and external link icons.
