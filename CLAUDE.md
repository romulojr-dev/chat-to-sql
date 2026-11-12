# chat-to-sql: project notes for Claude

A portfolio project: non-technical users ask questions in English, the app suggests **read-only SQL**, the user clicks Run, and sees a table plus a chart when one fits. Quality is measured by a reproducible eval. Free-tier only ($0 hosting).

Source of truth, in order: `docs/intent/chat-to-sql.md` (what and why), `SPEC.md` (how), `tasks/plan.md` (approach and risks), `tasks/todo.md` (progress). Read `tasks/todo.md` first and continue from the first unchecked task.

## Status
- **T1 to T12 done and verified.** Live at https://chat-to-sql.vercel.app/ (Vercel auto-deploys from `main`; repo `romulojr-dev/chat-to-sql`).
- **Next: Phase 6, the eval (T11 DONE: 60 questions in `evals/questions.ts`, 14 negatives in `evals/negatives.ts`, verify with `npm run eval:check`; T12 DONE: `npm run eval -- --label <name>` runs everything and writes evals/results/<name>.{json,md}; rules in evals/compare.ts; T13 baseline + improvement), then T14 (e2e + accessibility) and T15 (README + final checks).**
- Eval rules (from SPEC.md): 30 to 100 questions with hand-written reference SQL, tiered easy/medium/hard, a held-out subset not used for prompt tuning, every reference SQL must pass the validator and run. Metrics: execution accuracy overall and by tier, valid-SQL rate, safety-block rate, p50/p95 latency, tokens and dollars per question, chart-choice accuracy. The baseline is the current prompt (no few-shot examples). Improvement levers to measure: column descriptions, few-shot examples, Haiku vs Sonnet, effort. Only claim numbers produced by the committed harness, and say "on our own N-question test set".

## Commands
`npm run dev | build | lint | typecheck | test` (Vitest; integration tests use the real Neon DB through `.env.local` and skip themselves without `DATABASE_URL`). `npm run db:seed` (reload dataset, idempotent), `npm run db:role` (recreate read-only role), `npm run limits:check` (Upstash smoke test). Before every commit: lint, typecheck, test, and build all pass.

## Architecture
- `lib/sql/validate.ts`: single read-only SELECT only, using `libpg-query` (the real Postgres parser) with table and function allowlists. `lib/sql/execute.ts`: runs validated SQL through a cursor in a READ ONLY transaction as the `readonly` role, 5 s timeout, 1000-row cap. `timestamp`/`date` come back as raw strings on purpose (the default parser shifts them by the server timezone).
- `lib/llm/`: `prompt.ts`, `suggest.ts` (`suggestSql`, structured output via zod, default model `claude-haiku-5-5`, UI-free so the eval can call it). `lib/schema/descriptions.ts` is the dataset description in the prompt; its facts were verified against the DB.
- `lib/chart/select.ts`: deterministic chart choice. `lib/limits/`: rate limits and a daily spend cap (Upstash Redis; `/api/suggest` fails closed on Vercel without it).
- `app/api/suggest` and `app/api/run` routes; both re-validate SQL server side. UI in `components/` uses shadcn/ui.
- Defense in depth: validator, read-only DB role, READ ONLY transaction, timeout and row cap, rate limits and spend cap. Never rely on the prompt for safety.

## Gotchas learned the hard way
- **Eval comparison:** never use greedy "first match" when pairing values within a tolerance; it strands values (this under-scored a correct answer once). `evals/compare.ts` uses sorted pairing for columns and exact bipartite matching for rows. A full eval run calls the LLM (about $0.02 on Haiku).
- **`.env.local` has CRLF line endings.** An empty `KEY=` looks non-empty to naive shell checks. Strip `\r` (`tr -d '\r'`) when testing values. Never print secret values; check length and prefix only.
- `.ts` scripts are CommonJS: no top-level `await`. Wrap in `async function main()` (or use `.mts` for throwaway probes).
- `libpg-query` must stay in `serverExternalPackages` (`next.config.ts`) or its `.wasm` path breaks in production builds.
- This Next.js version (16) differs from older docs: read `node_modules/next/dist/docs/` before Next-specific code (see `AGENTS.md`).
- Neon free tier: the first query after idle takes about 4 s (compute wakes); the UI shows a hint after 2.5 s.
- Python is available for scripted file edits; the Windows shell and heredocs mangle some quoting.
- shadcn files import `cn` from the `cn` npm package (legitimate, from the shadcn-ui org).
- `.env.example` documents every variable. Real secrets live only in `.env.local` and Vercel (marked Sensitive).

## How the user wants to work
- Test-first; verify claims against the running system, database, or live site rather than from memory, and report numbers faithfully including failures.
- One commit per task with a message that explains why; push to `main`; mark the task in `tasks/todo.md`.
- Ask before outward-facing or hard-to-reverse actions (deploys, deleting remote data, spending money). Be concise and plain about what was and wasn't verified.
- The dataset is Olist (CC BY-NC-SA 4.0): never commit the raw CSVs (`/data/` is gitignored); keep the attribution footer.
