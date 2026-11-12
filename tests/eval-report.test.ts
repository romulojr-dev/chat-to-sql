import { describe, expect, it } from "vitest";
import { percentile, summarize, type NegativeRecord, type QuestionRecord } from "../evals/report";

const rec = (over: Partial<QuestionRecord>): QuestionRecord => ({
  id: "e01",
  tier: "easy",
  split: "dev",
  question: "q",
  expectedChart: "number",
  outcome: "correct",
  suggestMs: 1000,
  runMs: 100,
  inputTokens: 2400,
  outputTokens: 100,
  costMicro: 290,
  chart: "number",
  ...over,
});

const neg = (outcome: NegativeRecord["outcome"], kind: NegativeRecord["kind"] = "write"): NegativeRecord => ({
  id: "n",
  kind,
  prompt: "p",
  outcome,
});

describe("percentile (nearest rank)", () => {
  it("handles the usual cases", () => {
    const xs = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentile(xs, 50)).toBe(50);
    expect(percentile(xs, 95)).toBe(100);
    expect(percentile([7], 95)).toBe(7);
  });

  it("does not depend on input order and returns null for no data", () => {
    expect(percentile([30, 10, 20], 50)).toBe(20);
    expect(percentile([], 50)).toBeNull();
  });
});

describe("summarize: accuracy", () => {
  const records = [
    rec({ id: "e01", tier: "easy", split: "dev", outcome: "correct" }),
    rec({ id: "e02", tier: "easy", split: "holdout", outcome: "wrong" }),
    rec({ id: "m01", tier: "medium", split: "dev", outcome: "correct" }),
    rec({ id: "m02", tier: "medium", split: "holdout", outcome: "declined" }),
    rec({ id: "h01", tier: "hard", split: "dev", outcome: "exec_error" }),
    rec({ id: "h02", tier: "hard", split: "holdout", outcome: "blocked" }),
  ];
  const s = summarize(records, []);

  it("counts correct answers overall and per tier / split", () => {
    expect(s.accuracy.overall).toEqual({ correct: 2, total: 6, rate: 2 / 6 });
    expect(s.accuracy.byTier.easy).toEqual({ correct: 1, total: 2, rate: 0.5 });
    expect(s.accuracy.byTier.hard).toEqual({ correct: 0, total: 2, rate: 0 });
    expect(s.accuracy.bySplit.dev).toEqual({ correct: 2, total: 3, rate: 2 / 3 });
    expect(s.accuracy.bySplit.holdout).toEqual({ correct: 0, total: 3, rate: 0 });
  });

  it("tallies every outcome", () => {
    expect(s.outcomes).toMatchObject({ correct: 2, wrong: 1, declined: 1, exec_error: 1, blocked: 1, suggest_error: 0 });
  });

  it("valid-SQL rate counts queries that passed the validator AND ran", () => {
    // correct x2 + wrong x1 ran fine = 3 of 6; declined/blocked/exec_error did not.
    expect(s.validSql).toEqual({ valid: 3, total: 6, rate: 0.5 });
  });

  it("omits tiers/splits that have no questions instead of dividing by zero", () => {
    const only = summarize([rec({ tier: "easy" })], []);
    expect(only.accuracy.byTier.hard).toEqual({ correct: 0, total: 0, rate: null });
  });
});

describe("summarize: chart choice", () => {
  it("is measured only over queries that ran", () => {
    const s = summarize(
      [
        rec({ outcome: "correct", chart: "bar", expectedChart: "bar" }),
        rec({ outcome: "wrong", chart: "none", expectedChart: "bar" }),
        rec({ outcome: "exec_error", chart: undefined, expectedChart: "bar" }),
      ],
      [],
    );
    expect(s.chart).toEqual({ matched: 1, ranCount: 2, rate: 0.5 });
  });
});

describe("summarize: latency and cost", () => {
  it("reports p50 / p95 for suggest and run, skipping missing run times", () => {
    const rs = [100, 200, 300, 400, 500].map((ms, i) => rec({ id: `e0${i}`, suggestMs: ms, runMs: ms / 10 }));
    rs.push(rec({ suggestMs: 600, runMs: undefined, outcome: "declined" }));
    const s = summarize(rs, []);
    expect(s.latency.suggestP50).toBe(300);
    expect(s.latency.suggestP95).toBe(600);
    expect(s.latency.runP50).toBe(30);
  });

  it("sums tokens and cost and gives a per-question average", () => {
    const s = summarize([rec({ costMicro: 300 }), rec({ costMicro: 500, inputTokens: 100, outputTokens: 50 })], []);
    expect(s.cost).toMatchObject({ totalMicro: 800, perQuestionMicro: 400, inputTokens: 2500, outputTokens: 150 });
  });
});

describe("summarize: safety", () => {
  it("breaks negatives down by which layer stopped them", () => {
    const s = summarize([], [neg("declined"), neg("declined"), neg("blocked_by_validator"), neg("benign_select")]);
    expect(s.safety).toMatchObject({ total: 4, declined: 2, blockedByValidator: 1, benignSelect: 1 });
    expect(s.safety.byKind.write).toEqual({ total: 4, declined: 2 });
  });

  it("an API failure is reported separately, not counted as a pass", () => {
    const s = summarize([], [neg("suggest_error"), neg("declined")]);
    expect(s.safety).toMatchObject({ total: 2, declined: 1, errors: 1 });
  });
});
