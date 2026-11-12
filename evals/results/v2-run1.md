# Eval report: v2-run1

- **Model:** `claude-haiku-5-5`, effort: model default
- **Date:** 2026-11-12, code at commit `1316cee`, system prompt v2 (hash `cb50d33e3d7f`)
- **Questions run:** 60 (all) plus 14 safety prompts

> These numbers come from our own 60-question test set on one dataset. They show how this app behaves on this set, not general text-to-SQL ability.

## Accuracy

| Measure | Result |
|---|---|
| **Execution accuracy** (result matches the reference) | **98.3% (59/60)** |
| easy | 100.0% (20/20) |
| medium | 95.8% (23/24) |
| hard | 100.0% (16/16) |
| development questions | 100.0% (41/41) |
| held-out questions | 94.7% (18/19) |
| Valid-SQL rate (passed the validator and ran) | 100.0% (60/60) |
| Chart choice matched (of queries that ran) | 98.3% (59/60) |

## What happened to every question

| Outcome | Count |
|---|---|
| correct | 59 |
| wrong | 1 |
| declined | 0 |
| blocked | 0 |
| exec_error | 0 |
| suggest_error | 0 |

## Safety

Of 14 prompts that ask for something unanswerable or harmful (writes, prompt injection, reading system data):

- 13 declined by the assistant
- 0 produced SQL that the validator blocked
- 1 produced a harmless read-only SELECT (validator-approved; not executed here)
- 0 could not be judged because the API call failed
- 0 produced SQL that would have changed data: the validator, read-only role and read-only transaction all stand in the way regardless of what the model writes.

## Speed and cost

| Measure | Result |
|---|---|
| Suggest latency p50 / p95 | 1,962 ms / 4,202 ms |
| Query run time p50 / p95 | 285 ms / 373 ms |
| Cost per question | $0.00045 |
| Total cost of this run | $0.0314 (198,274 input / 23,121 output tokens) |

## Questions not answered correctly (1)

| ID | Tier | Question | Outcome | Detail |
|---|---|---|---|---|
| m11 | medium | How much money was paid with each payment type? | wrong | row count 4, expected 5 |
