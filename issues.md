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

---

## 12) Cloud SaaS Rollout (Multi‑Tenant)
- Scope: Ship a secure, multi‑tenant hosted service with auth, quotas, and job execution.
- Plan:
  - Auth: Auth.js (NextAuth) with email magic link/OAuth2; optional TOTP for publish.
  - Tenants: users↔tenants RBAC (owner/admin/member); all queries scoped by `tenant_id`.
  - Rate limits: per‑tenant + per‑IP (burst + sustained); reject with friendly error.
  - API: `/api/publications`, `/api/jobs`, `/api/jobs/{id}/events` (SSE), `/api/me`.
  - DB: Postgres (Neon/RDS) with `users`, `tenants`, `publications`, `jobs`, `runs` tables.
  - Storage: S3 for encrypted Playwright storageState, screenshots, JSONL runs.
  - Queue: SQS (or Pub/Sub) for job dispatch; DLQ for failures.
  - Billing (phase 2): Stripe subscriptions; quotas per plan.
- Criteria:
  - End‑to‑end draft/update/publish works for two different tenants concurrently.
  - No cross‑tenant data leakage (verified by tests + manual checks).
  - Rate limits enforced (429 with helpful message).

## 13) Playwright Worker Service (K8s/ECS)
- Scope: Containerized worker that executes Substack jobs reliably at scale.
- Design:
  - Docker image FROM `mcr.microsoft/playwright:lts` + Node 18.
  - K8s Deployment: 1 job/pod concurrency; HPA autoscale by queue depth; read‑only root FS, tmpfs `/tmp`.
  - IAM Roles for Service Accounts: S3 (scoped prefixes), KMS (encrypt/decrypt), SQS (receive/delete).
  - Network: private subnets + NAT egress; NetworkPolicy egress allowlist.
  - SAFE_MODE honored; selectors single‑sourced in `src/infra/selectors/substack.ts`.
- Criteria:
  - Queue backlog drains under scale‑up; average draft job ≤ 30s P50.
  - Jobs isolated: no cookie leakage; each job runs fresh browser context.
  - Worker pods pass security baseline (non‑root, seccomp runtime default).

## 14) Secure Substack Connect Flow (Email + Code)
- Scope: Let users connect their publication via email + 6‑digit code; store cookies securely.
- Steps:
  1. User enters publication URL + email.
  2. Worker starts login, requests 6‑digit code.
  3. User enters code; worker completes login and saves storageState.
  4. Storage state encrypted (envelope): KMS CMK → data key → AES‑GCM; stored in S3 path `auth-states/{tenant}/{publication}.json.enc` with TTL + metadata.
  5. Publication record updated with `auth_state_key` and `auth_updated_at`.
- Criteria:
  - No cookie body in logs; only fingerprints.
  - Expired cookies trigger reconnect flow.
  - Decrypt only in memory inside worker.

## 15) Observability, SLOs, and Alerting
- Scope: End‑to‑end telemetry and actionable alerts.
- Plan:
  - Logs: structured JSON (tenant_id, job_id, tool, phase, status, duration). Redact PII.
  - Metrics: job throughput, success/fail rate, queue depth, browser start failures, token usage.
  - Tracing: OpenTelemetry (optional) with spans for tool calls and driver steps.
  - Alerts: high queue depth, job failure spikes, reconnect spikes, 5xx rate.
- Criteria:
  - On failure spikes, alert fires and links to runbook.
  - Dashboards show P50/P95 for draft/update/publish durations.

## 16) CI/CD & IaC
- Scope: Reproducible infra and safe deployments.
- Plan:
  - Terraform (or Pulumi) for VPC, EKS/ECS, SQS, S3, KMS, RDS.
  - Two Docker images: `api` (if needed) and `worker`.
  - Pipelines: lint, typecheck, unit tests, light Playwright mock tests, build & push images, deploy with canary.
- Criteria:
  - One‑command env bring‑up; rollback < 10 minutes.
  - Secrets never baked into images; runtime via IAM/KMS/Secrets Manager.

## 17) Security & Compliance
- Scope: Systemic hardening and data handling policies.
- Plan:
  - HTTPS/HSTS, strict CSP, CSRF tokens on web forms, SameSite=strict cookies.
  - Key rotation policy for KMS; S3 lifecycle rules for artifacts.
  - Access reviews; least‑privilege IAM; audit logs for sensitive ops (publish).
  - Privacy: user export/delete endpoints.
- Criteria:
  - External review passes baseline security checklist.
  - Verified redaction of secrets across logs and error surfaces.
