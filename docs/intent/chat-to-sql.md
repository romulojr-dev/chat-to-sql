# Intent: chat-to-sql

Status: confirmed by the user (2026-11-11)

## Outcome
A web app where a user types a plain-English question and the app suggests a read-only SQL query. The user decides whether to run it. Results appear in a table, plus a chart when the data suits one.

## User
Non-technical teammates who can't write SQL but want a sense of the data. The audience that evaluates the project is portfolio reviewers.

## Why now
A portfolio project to land a software developer job, showing real LLM integration with measurable quality.

## Success
- A reviewer opens the live demo and uses it immediately, with no setup or login. They get sensible SQL, results, and charts over a realistic e-commerce dataset.
- A reproducible eval suite (about 30 to 100 questions with reference SQL) reports execution accuracy by difficulty, valid-SQL rate, safety-block rate, latency (p50 and p95), and cost per query. It is published in the README or on a results page, with before and after numbers from prompt improvements.

## Constraints
- $0 spend.
- Stack: Next.js with TypeScript, route handlers for the backend (no separate backend), Vercel, Neon free tier.
- Dataset sized to fit the free tier, such as a Kaggle subset like Olist.
- LLM: Claude API.
- The SQL-generation step must be callable outside the UI so the eval harness can use it.
- Eval runs cost a little and run on demand, not on every commit.

## Out of scope for v1
- FastAPI or any separate backend.
- Users connecting their own databases.
- Auto-run of suggested queries (possible later feature).
- Write queries (INSERT, UPDATE, DELETE, DDL).
- Auth or multi-user accounts.
- Claims of benchmark-level accuracy beyond our own test set.

## Assumptions to confirm in the spec
- The user confirms each suggested query before it runs.
- Claude API is the LLM provider.
