# Task List: chat-to-sql

Order follows dependencies. Size: XS/S/M. Each task leaves the app working.

## Phase 1: Foundation

- [x] **T1: Scaffold the project** (S)
  - Acceptance: Next.js App Router + TS strict + Tailwind + shadcn/ui initialized; `lint`, `typecheck`, `test` (Vitest), `build` scripts work; `.env.example` lists required vars; `.gitignore` excludes `.env*`
  - Verify: `npm run lint && npm run typecheck && npm test && npm run build`
  - Depends on: none
  - Files: `package.json`, `tsconfig.json`, `components.json`, `app/page.tsx`, `.env.example`

- [x] **T2: Dataset, Neon DB, read-only role** (M)
  - Acceptance: Olist license checked and recorded in `docs/`; current Neon free limits checked; `npm run db:seed` is idempotent and loads the data with indexes; a `readonly` role has SELECT only on dataset tables; row counts documented
  - Verify: seed twice -> same counts; connecting as `readonly`, `INSERT`/`DROP` fail with permission errors; DB size < free-tier limit with headroom
  - Depends on: T1
  - Files: `scripts/seed.ts`, `scripts/roles.sql`, `docs/dataset.md`, `.env.example`

### Checkpoint 1: Foundation
- [x] Build, lint, typecheck pass; DB seeded; read-only role verified; dataset license and size confirmed (if not, stop and decide on dataset)

## Phase 2: Safety core

- [x] **T3: SQL validator + safety set** (M)
  - Acceptance: `validateReadOnlySql` accepts a single `SELECT`/`WITH...SELECT`; rejects multi-statement, DML/DDL, `COPY`, `SET`, system catalogs, non-allowlisted functions (`pg_sleep`, `pg_read_file`, `dblink`...), oversized input; parser chosen after a spike; committed safety set of 30+ blocked inputs and an allowed set including every eval-style query shape
  - Verify: `npm test -- lib/sql/validate` all green; safety set 100% blocked
  - Depends on: T1
  - Files: `lib/sql/validate.ts`, `tests/validate.test.ts`, `tests/safety-set.json`

- [x] **T4: Read-only executor** (S)
  - Acceptance: `execute` runs in `BEGIN READ ONLY` as the `readonly` role, enforces statement timeout and 1,000-row cap, returns `{columns, rows, truncated, durationMs}`
  - Verify: integration tests: timeout fires on slow query; cap sets `truncated`; a write attempted with the validator bypassed must still fail at the DB layer
  - Depends on: T2
  - Files: `lib/sql/execute.ts`, `tests/execute.integration.test.ts`

### Checkpoint 2: Safety core
- [ ] All safety tests pass; writes provably fail at the DB layer; human review of validator rules

## Phase 3: First vertical slice (no LLM)

- [x] **T5: `/api/run` + minimal UI table** (M)
  - Acceptance: `POST /api/run` validates (Zod + `validateReadOnlySql`), executes, returns the contract in SPEC; UI has an SQL textbox with a Run button and a shadcn table, loading skeleton, readable error alerts for 400/408
  - Verify: unit test for route handler; manual: run a sample `SELECT`, a blocked query shows a friendly error
  - Depends on: T3, T4
  - Files: `app/api/run/route.ts`, `components/SqlPreview.tsx`, `components/ResultsTable.tsx`, `app/page.tsx`

- [x] **T6: Chart selection + chart UI** (S)
  - Acceptance: `selectChart` implements SPEC rules (bar, line, big number, none); `ResultChart` uses shadcn `chart`; tabs switch table/chart; chart has a text alternative
  - Verify: `npm test -- lib/chart` table-driven tests; manual check with 3 result shapes
  - Depends on: T5
  - Files: `lib/chart/select.ts`, `components/ResultChart.tsx`, `tests/chart.test.ts`

### Checkpoint 3: First slice
- [ ] Hardcoded SQL -> validated -> executed -> table + chart works locally; review with human before spending API money

## Phase 4: LLM

- [x] **T7: Schema description + prompt + response parser** (M)
  - Acceptance: `lib/llm` builds the system prompt from table/column descriptions and rules; question passed as data; parser extracts `{sql, explanation}` or a typed "cannot answer"; model ID from env; token usage returned; no UI imports
  - Verify: unit tests with mocked SDK for good output, malformed output, refusal, and prompt-injection strings
  - Depends on: T1
  - Files: `lib/llm/prompt.ts`, `lib/llm/suggest.ts`, `lib/schema/descriptions.ts`, `tests/llm.test.ts`

- [x] **T8: `/api/suggest` + end-to-end UI flow** (M)
  - Acceptance: question -> suggested SQL (validated server side before returning, 422 otherwise) + explanation shown; **Run is never automatic**; user can edit the SQL before running
  - Verify: route tests with mocked LLM; manual with real key on 5 questions
  - Depends on: T6, T7
  - Files: `app/api/suggest/route.ts`, `components/QuestionBox.tsx`, `app/page.tsx`

- [x] **T9: UX polish for reviewers** (S)
  - Acceptance: 4-6 example question chips; cold-start loading state; friendly errors for 422/429/503; mobile layout works
  - Verify: manual on mobile viewport and with the DB suspended
  - Status: code, error mapping (unit-tested), chips and footer verified on the production build; the phone-width look and the cold-start hint still need a human eyeball (carried to Checkpoint 4/T14).
  - Depends on: T8
  - Files: `components/ExampleQuestions.tsx`, `app/page.tsx`

### Checkpoint 4: Core flow
- [ ] Full question -> SQL -> Run -> table/chart flow works with the real model; human review

## Phase 5: Protection

- [ ] **T10: Rate limits + hard spend cap** (M)
  - Acceptance: per-IP limits on both routes; global daily LLM cap (token/dollar based) that returns 503 with a friendly message; input length caps; free KV store set up
  - Verify: tests for limit and cap logic; manual: exceed limit -> 429; cap reached -> 503
  - Status: code done and verified locally (250 tests; 429 and fail-closed checked on the production build). Still open: create the Upstash store on Vercel, verify the Upstash adapter against it with `npm run limits:check`, and observe the 503 cap live. Do not add ANTHROPIC_API_KEY to Vercel until then.
  - Depends on: T8
  - Files: `lib/limits.ts`, `app/api/*/route.ts`, `tests/limits.test.ts`, `.env.example`

## Phase 6: Eval

- [ ] **T11: Eval question set** (M)
  - Acceptance: 30-100 questions with hand-written reference SQL, tier (easy/medium/hard), expected chart type; a holdout subset marked; every reference SQL passes the validator and runs
  - Verify: script runs all reference SQL against the DB with no errors
  - Depends on: T2, T3
  - Files: `evals/questions.json`, `evals/check-references.ts`

- [ ] **T12: Eval harness + report** (M)
  - Acceptance: `npm run eval` imports `lib/llm`/`lib/sql` directly; computes execution accuracy (result-set comparison rules documented: ordering, rounding, column naming), valid-SQL rate, safety-block rate, p50/p95 latency, tokens and $ per query, chart-choice accuracy; writes JSON and Markdown to `evals/results/`
  - Verify: harness unit tests for result comparison; dry run on 5 questions
  - Depends on: T7, T11
  - Files: `evals/run.ts`, `evals/compare.ts`, `tests/compare.test.ts`

- [ ] **T13: Baseline, improve, re-measure** (M)
  - Acceptance: baseline report committed; one or more changes (e.g. column descriptions, few-shot examples, model comparison) with before and after numbers, tuned on non-holdout and reported on both
  - Verify: committed reports reproduce via `npm run eval`
  - Depends on: T12
  - Files: `evals/results/*`, `lib/schema/descriptions.ts`, `lib/llm/prompt.ts`

### Checkpoint 5: Eval
- [ ] Baseline and improved numbers exist; human review of claims before putting them in the README

## Phase 7: Ship

- [ ] **T14: E2E smoke test + accessibility pass** (S)
  - Acceptance: Playwright test (stubbed LLM): example question -> SQL -> Run -> table; labels, focus order, keyboard use verified; chart text alternative present
  - Verify: `npm run test:e2e`; manual keyboard-only run
  - Depends on: T9
  - Files: `e2e/smoke.spec.ts`, `playwright.config.ts`

- [ ] **T15: Deploy + README** (S)
  - Acceptance: Vercel deploy with env vars; live URL works from a fresh browser with no login; README has demo link, screenshots/GIF, architecture, safety design, eval results (with the honest "own test set" caveat), run instructions
  - Verify: open the live URL cold; run 3 questions; confirm caps are active in production
  - Depends on: T10, T13, T14
  - Files: `README.md`, `docs/`

### Checkpoint 6: Done
- [ ] All SPEC success criteria checked; no secrets in git history; live demo verified
