# Spec: chat-to-sql

Source of truth for intent: `docs/intent/chat-to-sql.md`. Status: DRAFT, awaiting approval.

## Objective

A public web app where a non-technical user types a question in plain English, the app suggests a read-only SQL query with a short plain-English explanation, and the user decides whether to run it. Results show as a table, plus a chart when the result shape suits one. The app queries a bundled e-commerce dataset. A reproducible eval suite measures quality.

**Primary audience:** portfolio reviewers who open the live demo with no setup or login.
**Persona in the UI:** a teammate who cannot write SQL.

### User flow
1. User sees the app with 4 to 6 clickable example questions and a text box.
2. User submits a question. The app shows a suggested SQL query and a one-to-two-sentence explanation.
3. User reads the SQL and clicks **Run** (nothing runs automatically). They can also edit the question and re-suggest.
4. The app shows a results table (capped), query duration, a "truncated" notice if capped, and a chart when applicable.
5. Errors (invalid SQL, timeout, blocked query) display as plain-language messages, never a stack trace.

### Success criteria (testable)
**Product**
- [ ] A reviewer can complete steps 1 to 4 on the deployed URL with no login, in under 60 seconds from page load (warm database).
- [ ] 100% of the safety test set (see Testing) is blocked: no write, DDL, multi-statement, or out-of-schema access succeeds.
- [ ] Cold-start (idle Neon) shows a loading state and still completes without an error.
- [ ] Page is usable on a mobile viewport and keyboard-navigable (labels, focus order, chart has a text/table alternative).

**Eval (reported in README)**
- [ ] Eval suite of 30 to 100 questions with hand-written reference SQL, tiered easy / medium / hard.
- [ ] One command runs the suite and writes a JSON report plus a Markdown summary.
- [ ] Report includes: execution accuracy overall and by tier, valid-SQL rate, safety-block rate, latency p50/p95 (suggest and run separately), and tokens and dollars per query.
- [ ] README shows at least one before and after comparison from a real prompt or model change (e.g. adding column descriptions, or Haiku vs Sonnet).
- [ ] Targets are set after the first baseline run, not guessed now. No claim beyond "on our own N-question test set."

**Cost**
- [ ] Hosting spend is $0. LLM spend is bounded by a hard cap (see Boundaries).

## Tech Stack
- Next.js (App Router) + TypeScript strict, React
- Backend: Next.js route handlers (Node runtime), no separate server
- Database: Neon Postgres (free tier), `@neondatabase/serverless` driver
- LLM: Anthropic Claude via `@anthropic-ai/sdk`, model ID in an env var (default to a smaller, cheaper model; compare in eval)
- SQL validation: a Postgres-dialect parser (candidates: `pgsql-parser` or `node-sql-parser`, to be chosen in the plan)
- Validation of API payloads: Zod
- UI: shadcn/ui components (copied into the repo, built on Radix UI primitives) + Tailwind CSS
- Charts: shadcn/ui `chart` component, which wraps Recharts
- Tests: Vitest, Playwright (one smoke test)
- Hosting: Vercel (free)

Exact dependency versions are pinned in `package.json`. Do not trust version numbers written in this spec.

## Commands
```
Install:   npm install
Dev:       npm run dev
Build:     npm run build
Lint:      npm run lint
Typecheck: npm run typecheck        # tsc --noEmit
Test:      npm test                 # vitest run
E2E:       npm run test:e2e         # playwright test
Seed DB:   npm run db:seed          # loads dataset into Neon (idempotent)
Eval:      npm run eval -- --model <id> --out evals/results/<name>.json
```
(Scripts are created during implementation; this is the contract.)

## Project Structure
```
app/                      → UI + route handlers
app/api/suggest/route.ts  → POST: question -> suggested SQL + explanation
app/api/run/route.ts      → POST: SQL -> validated, executed, rows + chart spec
components/ui/            → shadcn/ui primitives (generated via the shadcn CLI; treat as vendored, edit sparingly)
components/               → QuestionBox, SqlPreview, ResultsTable, ResultChart (app components composed from components/ui)
lib/llm/                  → prompt building, Claude call, response parsing (UI-independent)
lib/sql/validate.ts       → parse + allowlist checks (pure, heavily tested)
lib/sql/execute.ts        → read-only execution with timeout and row cap
lib/chart/select.ts       → result shape -> chart type (pure, tested)
lib/schema/               → schema description fed to the LLM
scripts/seed.ts           → dataset loader
evals/questions.json      → questions + reference SQL + tier + expected chart type
evals/run.ts              → harness; imports lib/llm and lib/sql directly, not the UI
evals/results/            → committed run reports
docs/                     → intent, ADRs, results write-up
tests/                    → unit tests
e2e/                      → Playwright smoke test
```
**Hard rule:** `lib/llm` and `lib/sql` must not import from `app/` or React, so the eval harness can use them.

## API Contracts

`POST /api/suggest`
- Request: `{ question: string }` (1 to 500 chars)
- Response 200: `{ sql: string, explanation: string, usage: { inputTokens, outputTokens } }`
- 400 invalid input, 422 the model produced no usable SQL or an unanswerable question (message explains), 429 rate limited, 503 LLM unavailable or budget cap reached.
- The returned SQL has already passed validation; if it fails, the server returns 422, never unsafe SQL.

`POST /api/run`
- Request: `{ sql: string }` (the client may have edited it, so it is untrusted and **re-validated server side**)
- Response 200: `{ columns: string[], rows: unknown[][], rowCount, truncated: boolean, durationMs, chart: ChartSpec | null }`
- 400 rejected by validation (with a reason), 408 statement timeout, 429 rate limited.

## Safety Design (defense in depth, never rely on one layer)
1. **Database role:** a dedicated Postgres role with `SELECT` only on the dataset tables. No other schema access.
2. **Read-only transaction:** every query runs in `BEGIN READ ONLY`.
3. **Parser validation:** exactly one statement; top-level must be `SELECT` (or `WITH ... SELECT`); reject any DML/DDL, `COPY`, `SET`, `pg_*`/`information_schema` access, and functions outside an allowlist (e.g. block `pg_sleep`, `pg_read_file`, `dblink`).
4. **Limits:** `statement_timeout` (target 5s, tuned later), result cap (target 1,000 rows), inject or enforce `LIMIT`, cap SQL text length.
5. **Prompt hardening:** schema and rules in the system prompt; the user's question is passed as data. The prompt layer is advisory only; layers 1 to 4 are what enforce safety.
6. **Rate limiting + spend cap** on `/api/suggest` and `/api/run`.
7. **Logging:** log question, SQL, validation result, latency, and token usage. No secrets, no raw credentials.

## Chart Selection
Deterministic, not LLM-driven, so it is testable. `lib/chart/select.ts` maps result shape to a chart:
- 1 categorical + 1 numeric column, ≤ ~20 rows → bar
- 1 date/time + 1 numeric column → line
- 1 categorical + 1 numeric, small row count, values are parts of a whole → bar (pie avoided by default)
- Single scalar → big-number card, no chart
- Otherwise → table only
The eval labels expected chart type per question to report chart-choice accuracy.

## Dataset
- Candidate: Olist Brazilian e-commerce (Kaggle): orders, items, customers, products, sellers, payments, reviews. About 100k orders, which should fit the free tier.
- Requirements: license permits public use and redistribution of a derived subset (verify before committing any data files); must fit the Neon free storage limit with headroom (**verify current limits**); loaded by `npm run db:seed`; indexes on join and filter columns; raw data files are not committed if large or license-restricted.
- Add short human-readable table and column descriptions for the LLM (a measurable lever in the eval).

## UI
Use shadcn/ui components rather than hand-rolled ones. Likely set: `button`, `textarea`, `card`, `table`, `badge`, `alert`, `skeleton` (loading and cold-start states), `tabs` (table / chart view), `tooltip`, `sonner` toast, `chart`. Add components one at a time with the shadcn CLI as each is needed. Support light and dark themes through shadcn's CSS variables. Accessibility comes mostly from Radix, but the success criteria (labels, focus order, chart text alternative) still have to be verified.

## Code Style
TypeScript strict, no `any` in `lib/`. Pure functions for validation and chart selection. Zod at every API boundary. Small modules, named exports.

```ts
// lib/sql/validate.ts
export type ValidationResult =
  | { ok: true; sql: string }
  | { ok: false; reason: string };

export function validateReadOnlySql(sql: string): ValidationResult {
  // parse -> exactly one statement -> SELECT only -> function allowlist
}
```
Naming: `camelCase` functions, `PascalCase` components and types, `kebab-case` for non-component files. Formatting and lint enforced by ESLint + Prettier.

## Testing Strategy
- **Unit (Vitest):** `validate.ts` with a large table of allowed and blocked queries (the safety set), `select.ts`, prompt builder, response parser. LLM calls mocked.
- **Integration:** `execute.ts` against a Neon branch or local Postgres: timeout fires, row cap applies, writes fail even if validation is bypassed (proves layers 1 and 2).
- **E2E (Playwright):** one smoke test, example question -> SQL shown -> Run -> table renders. LLM stubbed in CI.
- **Eval (separate from tests):** real LLM calls, run on demand, not in CI by default.
- **Safety set:** a committed list of at least 30 malicious or abusive inputs and SQL strings (prompt injection, stacked statements, `DROP`, `pg_sleep`, comment tricks, unicode tricks). Required pass rate: 100%.
- Coverage: no global percentage target; `lib/sql` and `lib/chart` expected to be thoroughly covered.

## Boundaries
**Always**
- Re-validate SQL server side on `/api/run`, even if `/api/suggest` produced it.
- Run tests and typecheck before commits.
- Keep API keys and the database URL in environment variables only.
- Keep `lib/llm` and `lib/sql` independent of the UI.

**Ask first**
- Adding any dependency (adding a shadcn component via the CLI is pre-approved).
- Changing the DB role grants or the validation rules (loosening only).
- Changing the dataset or the eval question set after a baseline is published.
- Anything that could incur cost (paid tier, larger model by default).

**Never**
- Commit secrets, `.env`, or large/restricted raw data.
- Let the app execute a query without the user clicking Run (auto-run is out of scope for v1).
- Execute SQL outside a read-only transaction.
- Weaken, skip, or delete a safety test to make it pass.
- Report accuracy numbers not produced by the committed eval harness.

## Out of Scope (v1)
FastAPI or separate backend; user-supplied databases; auto-run; write queries; auth and accounts; benchmark-level accuracy claims.

## Open Questions (need your input)
1. **LLM budget:** the Claude API is not free. What monthly cap are you willing to spend (even a few dollars)? Without a cap, a public demo can be abused. Proposed default: a hard server-side daily cap plus per-IP rate limits, and a friendly "demo limit reached" message.
2. **Dataset:** OK with Olist as the default, subject to a license and size check? Any preference for another dataset?
3. **Model:** start with the smallest, cheapest Claude model and use the eval to justify an upgrade, or start with a stronger model?
4. **Rate limiting storage:** needs a store (e.g. Vercel KV or Upstash free tier). Acceptable to add one free service, or keep in-memory best-effort limits (weaker on serverless)?
5. ~~Chart library~~ Resolved: shadcn/ui `chart` (Recharts under the hood).
6. **Chat vs single-shot:** v1 is single-question -> SQL (no multi-turn follow-ups like "now filter by 2018"). OK to defer conversation memory?
