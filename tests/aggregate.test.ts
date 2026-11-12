import { describe, expect, it } from "vitest";
import { aggregateGroup, compareGroups, spread, type RunData } from "../evals/aggregate";
import { summarize, type QuestionRecord } from "../evals/report";

const rec = (id: string, outcome: QuestionRecord["outcome"], over: Partial<QuestionRecord> = {}): QuestionRecord => ({
  id,
  tier: id[0] === "e" ? "easy" : id[0] === "m" ? "medium" : "hard",
  split: "dev",
  question: id,
  expectedChart: "number",
  outcome,
  suggestMs: 1000,
  runMs: 100,
  inputTokens: 2000,
  outputTokens: 100,
  costMicro: 250,
  chart: "number",
  ...over,
});

const run = (outcomes: Record<string, QuestionRecord["outcome"]>): RunData => {
  const records = Object.entries(outcomes).map(([id, o]) => rec(id, o));
  return { records, summary: summarize(records, []) };
};

describe("spread", () => {
  it("gives mean, min and max", () => {
    expect(spread([0.5, 0.7, 0.6])).toEqual({ mean: 0.6, min: 0.5, max: 0.7 });
  });

  it("handles a single value and no values", () => {
    expect(spread([0.9])).toEqual({ mean: 0.9, min: 0.9, max: 0.9 });
    expect(spread([])).toEqual({ mean: null, min: null, max: null });
  });
});

describe("aggregateGroup", () => {
  const runs = [
    run({ e01: "correct", m01: "wrong", h01: "correct", h02: "correct" }),
    run({ e01: "correct", m01: "wrong", h01: "wrong", h02: "correct" }),
    run({ e01: "correct", m01: "wrong", h01: "correct", h02: "correct" }),
  ];
  const g = aggregateGroup(runs);

  it("reports accuracy as a spread across runs", () => {
    expect(g.runs).toBe(3);
    // Runs score 3/4, 2/4 and 3/4.
    expect(g.overall.min).toBe(0.5);
    expect(g.overall.max).toBe(0.75);
    expect(g.overall.mean).toBeCloseTo(2 / 3, 5);
  });

  it("separates consistent results from flaky ones", () => {
    expect(g.correctEveryRun.sort()).toEqual(["e01", "h02"]);
    expect(g.wrongEveryRun).toEqual(["m01"]);
    expect(g.flaky).toEqual(["h01"]);
  });

  it("averages cost and latency per run", () => {
    expect(g.costPerRunMicro).toBe(1000);
    expect(g.suggestP50).toBe(1000);
  });
});

describe("compareGroups", () => {
  const before = aggregateGroup([run({ a1: "wrong", a2: "correct", a3: "wrong" }), run({ a1: "wrong", a2: "correct", a3: "correct" })]);
  const after = aggregateGroup([run({ a1: "correct", a2: "correct", a3: "wrong" }), run({ a1: "correct", a2: "wrong", a3: "wrong" })]);
  const c = compareGroups(before, after);

  it("lists questions fixed in every run of the second group", () => {
    expect(c.fixed).toEqual(["a1"]);
  });

  it("lists questions that regressed (right every run before, not right every run after)", () => {
    expect(c.regressed).toEqual(["a2"]);
  });
});
