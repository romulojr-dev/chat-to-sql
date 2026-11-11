# Implementation Plan: chat-to-sql

Source docs: `docs/intent/chat-to-sql.md`, `SPEC.md` (approved). Tasks are tracked in `tasks/todo.md`.

## Overview
Build a public text-to-SQL demo (Next.js + shadcn/ui + Neon + Claude) with a defense-in-depth read-only safety layer and a reproducible eval suite. Vertical slices, with the riskiest unknowns first: dataset fit on the free tier, then SQL safety, then the LLM.

## Architecture Decisions
- **Safety before the LLM.** Validation and read-only execution are built and tested with hardcoded SQL first. The LLM is then just another producer of SQL that must pass the same gate.
- **First end-to-end slice has no LLM.** Run hardcoded SQL -> table proves the DB, API, and UI before spending any API money.
- **`lib/llm` and `lib/sql` are UI-free**, so the eval harness imports them directly.
- **Chart selection is deterministic** (`lib/chart/select.ts`), not LLM-driven, so it is unit-testable.
- **Cost protection is its own phase**, done before the public deploy but after the core flow works. Defaults from the approved open questions: cheapest model first, an Upstash/Vercel KV free store for rate limits, hard daily LLM cap, Olist pending license and size check, v1 single-shot only.
- **No new dependency outside the spec** without asking.

## Dependency Graph
```
Scaffold ─┬─ Dataset+DB role ─┬─ execute.ts ─┐
          │                   │               ├─ /api/run + UI table ─ chart ─┐
          └─ validate.ts ─────┴───────────────┘                               │
                                                                               ├─ /api/suggest + UI wiring ─ rate/spend caps ─ deploy
          lib/llm (schema desc + prompt + parser) ────────────────────────────┘
                                   └─ eval questions ─ eval harness ─ baseline + improvement ─ README
```

## Phases
1. **Foundation** (T1-T2): scaffold, dataset, DB role.
2. **Safety core** (T3-T4): validator, executor.
3. **First slice, no LLM** (T5-T6): run SQL -> table -> chart.
4. **LLM** (T7-T9): prompt/parser, suggest endpoint, full UI flow.
5. **Protection** (T10): rate limits and spend cap.
6. **Eval** (T11-T13): questions, harness, baseline and improvement.
7. **Ship** (T14-T15): e2e and accessibility, deploy and README.

Checkpoints after each phase, with a human review at 2, 3, 4, and 6.

## Risks and Mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| Olist license or size doesn't fit Neon free tier | High | T2 starts with a license and size check; fall back to a row-sampled subset or another dataset |
| SQL validator has a bypass | High | Defense in depth (DB role + READ ONLY txn + parser), 30+ item safety set, integration test proving writes fail even with validation bypassed |
| Public demo drains LLM budget | High | T10 hard daily cap, per-IP limits, input length caps; do not deploy publicly before T10 |
| Neon cold start hurts the demo | Med | Skeleton/loading state, retry once, measure p95 in eval |
| Parser library doesn't cover Postgres syntax well | Med | Choose the parser in T3 with a spike against the eval reference SQL; keep validator behind one interface |
| Model produces poor SQL on the schema | Med | Schema descriptions, few-shot examples; measured and improved in T13 |
| Eval numbers look overfit | Med | Hold out part of the question set from prompt tuning; report both |
| Free-tier limits change | Low | Verify at T2 and at deploy |

## Open Questions
- None blocking. Non-blocking items resolved by the defaults above. Revisit the daily spend cap amount at T10.
