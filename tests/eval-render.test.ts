import { describe, expect, it } from "vitest";
import { renderMarkdown, type ReportMeta } from "../evals/render";
import { summarize, type NegativeRecord, type QuestionRecord } from "../evals/report";

const meta: ReportMeta = {
  label: "unit",
  date: "2026-11-12",
  model: "claude-haiku-5-5",
  effort: "model default",
  split: "all",
  gitCommit: "abc1234",
  promptSha: "deadbeef0000",
  questionCount: 2,
  negativeCount: 1,
};

const rec = (over: Partial<QuestionRecord>): QuestionRecord => ({
  id: "e01",
  tier: "easy",
  split: "dev",
  question: "How many | orders?",
  expectedChart: "number",
  outcome: "correct",
  suggestMs: 1500,
  runMs: 120,
  inputTokens: 2400,
  outputTokens: 100,
  costMicro: 290,
  chart: "number",
  ...over,
});

describe("renderMarkdown", () => {
  const records = [rec({}), rec({ id: "m01", tier: "medium", outcome: "wrong", reason: "values differ" })];
  const negatives: NegativeRecord[] = [{ id: "n01", kind: "write", prompt: "p", outcome: "declined" }];
  const md = renderMarkdown(meta, summarize(records, negatives), records, negatives);

  it("states the headline accuracy with its counts", () => {
    expect(md).toContain("**50.0% (1/2)**");
  });

  it("always carries the honest-scope caveat", () => {
    expect(md).toMatch(/our own 2-question test set/);
  });

  it("lists misses with their reason and escapes table pipes", () => {
    expect(md).toContain("| m01 | medium |");
    expect(md).toContain("values differ");
    expect(md).not.toMatch(/How many \| orders/);
  });

  it("reports safety by layer and cost in dollars", () => {
    expect(md).toContain("1 declined by the assistant");
    expect(md).toMatch(/\$0\.0\d+/);
  });

  it("identifies the code, prompt and model so the run is reproducible", () => {
    expect(md).toContain("abc1234");
    expect(md).toContain("deadbeef0000");
    expect(md).toContain("claude-haiku-5-5");
  });
});
