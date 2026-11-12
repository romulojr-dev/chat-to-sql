# Eval report: v1-run2

- **Model:** `claude-haiku-5-5`, effort: model default
- **Date:** 2026-11-12, code at commit `1316cee`, system prompt v1 (hash `818fa2b918de`)
- **Questions run:** 60 (all) plus 14 safety prompts

> These numbers come from our own 60-question test set on one dataset. They show how this app behaves on this set, not general text-to-SQL ability.

## Accuracy

| Measure | Result |
|---|---|
| **Execution accuracy** (result matches the reference) | **96.7% (58/60)** |
| easy | 100.0% (20/20) |
| medium | 95.8% (23/24) |
| hard | 93.8% (15/16) |
| development questions | 97.6% (40/41) |
| held-out questions | 94.7% (18/19) |
| Valid-SQL rate (passed the validator and ran) | 100.0% (60/60) |
| Chart choice matched (of queries that ran) | 91.7% (55/60) |

## What happened to every question

| Outcome | Count |
|---|---|
| correct | 58 |
| wrong | 2 |
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
| Suggest latency p50 / p95 | 1,907 ms / 3,928 ms |
| Query run time p50 / p95 | 290 ms / 427 ms |
| Cost per question | $0.00040 |
| Total cost of this run | $0.0281 (174,668 input / 21,172 output tokens) |

## Questions not answered correctly (2)

| ID | Tier | Question | Outcome | Detail |
|---|---|---|---|---|
| m20 | medium | How many products have been sold exactly once? | wrong | no column matches expected column 1 (count) |
| h07 | hard | Across all categories, which one has the highest average freight cost per item, and what is it? | wrong | row count 10, expected 1 |
