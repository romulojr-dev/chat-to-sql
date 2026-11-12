# Eval summary

Accuracy is the mean over runs with the min-max range in brackets. Haiku's sampling cannot be pinned, so runs differ slightly even with identical code.

| Measure | v1 | v2 |
|---|---|---|
| Runs | 3 | 3 |
| **Execution accuracy** | **92.8% (88.3-96.7)** | **96.7% (95.0-98.3)** |
| easy | 100.0% (100.0-100.0) | 100.0% (100.0-100.0) |
| medium | 84.7% (75.0-95.8) | 93.1% (91.7-95.8) |
| hard | 95.8% (93.8-100.0) | 97.9% (93.8-100.0) |
| development questions | 92.7% (87.8-97.6) | 97.6% (95.1-100.0) |
| held-out questions | 93.0% (89.5-94.7) | 94.7% (94.7-94.7) |
| valid-SQL rate | 100.0% (100.0-100.0) | 99.4% (98.3-100.0) |
| chart choice matched (of queries that ran) | 88.9% (86.7-91.7) | 98.3% (98.3-98.3) |
| suggest latency p50 | 1819 ms | 2040 ms |
| cost per full run | $0.0282 | $0.0316 |

## Which questions

**v1**
- wrong in every run: m20
- flaky (right in some runs): h04, h07, m03, m04, m06, m11, m21

**v2**
- wrong in every run: m11
- flaky (right in some runs): h04, m21

**v1 -> v2**
- fixed in every run: m20
- no longer right in every run: none

