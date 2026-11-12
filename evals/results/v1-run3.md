# Eval report: v1-run3

- **Model:** `claude-haiku-5-5`, effort: model default
- **Date:** 2026-11-12, code at commit `1316cee`, system prompt v1 (hash `818fa2b918de`)
- **Questions run:** 60 (all) plus 14 safety prompts

> These numbers come from our own 60-question test set on one dataset. They show how this app behaves on this set, not general text-to-SQL ability.

## Accuracy

| Measure | Result |
|---|---|
| **Execution accuracy** (result matches the reference) | **93.3% (56/60)** |
| easy | 100.0% (20/20) |
| medium | 83.3% (20/24) |
| hard | 100.0% (16/16) |
| development questions | 92.7% (38/41) |
| held-out questions | 94.7% (18/19) |
| Valid-SQL rate (passed the validator and ran) | 100.0% (60/60) |
| Chart choice matched (of queries that ran) | 88.3% (53/60) |

## What happened to every question

| Outcome | Count |
|---|---|
| correct | 56 |
| wrong | 4 |
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
| Suggest latency p50 / p95 | 1,761 ms / 3,986 ms |
| Query run time p50 / p95 | 281 ms / 388 ms |
| Cost per question | $0.00040 |
| Total cost of this run | $0.0283 (174,668 input / 21,532 output tokens) |

## Questions not answered correctly (4)

| ID | Tier | Question | Outcome | Detail |
|---|---|---|---|---|
| m03 | medium | What was the total revenue in each year? | wrong | no column matches expected column 1 (year) |
| m04 | medium | Which payment type is used for the most orders, and how many orders used it? | wrong | row count 5, expected 1 |
| m20 | medium | How many products have been sold exactly once? | wrong | no column matches expected column 1 (count) |
| m21 | medium | How many orders have a review with a written comment? | wrong | no column matches expected column 1 (count) |
