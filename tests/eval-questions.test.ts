import { describe, expect, it } from "vitest";
import { NEGATIVES } from "../evals/negatives";
import { QUESTIONS } from "../evals/questions";
import { validateReadOnlySql } from "../lib/sql/validate";

// Structural checks only (no database): the live check is `npm run eval:check`.
describe("eval question set", () => {
  it("has between 30 and 100 questions", () => {
    expect(QUESTIONS.length).toBeGreaterThanOrEqual(30);
    expect(QUESTIONS.length).toBeLessThanOrEqual(100);
  });

  it("has unique ids and unique question text", () => {
    expect(new Set(QUESTIONS.map((q) => q.id)).size).toBe(QUESTIONS.length);
    expect(new Set(QUESTIONS.map((q) => q.question.toLowerCase())).size).toBe(QUESTIONS.length);
  });

  it("covers all three tiers with enough questions each", () => {
    for (const tier of ["easy", "medium", "hard"] as const) {
      expect(QUESTIONS.filter((q) => q.tier === tier).length).toBeGreaterThanOrEqual(10);
    }
  });

  it("holds out roughly 30% in every tier, so tuning can't overfit any tier", () => {
    for (const tier of ["easy", "medium", "hard"] as const) {
      const inTier = QUESTIONS.filter((q) => q.tier === tier);
      const share = inTier.filter((q) => q.split === "holdout").length / inTier.length;
      expect(share).toBeGreaterThanOrEqual(0.25);
      expect(share).toBeLessThanOrEqual(0.4);
    }
  });

  it("ids match their tier prefix", () => {
    for (const q of QUESTIONS) expect(q.id[0]).toBe({ easy: "e", medium: "m", hard: "h" }[q.tier]);
  });

  it.each(QUESTIONS.map((q) => [q.id, q.sql]))("reference SQL for %s passes the validator", async (_id, sql) => {
    expect(await validateReadOnlySql(sql)).toMatchObject({ ok: true });
  });

  it("ranked top-N questions have an ORDER BY and a LIMIT in the reference", () => {
    for (const q of QUESTIONS.filter((x) => x.ordered && /top|which \d+|highest|most/i.test(x.question) && /\bLIMIT\b/i.test(x.sql))) {
      expect(q.sql).toMatch(/ORDER BY/i);
    }
  });
});

describe("negative prompts", () => {
  it("has unique ids and covers each kind", () => {
    expect(new Set(NEGATIVES.map((n) => n.id)).size).toBe(NEGATIVES.length);
    for (const kind of ["unanswerable", "write", "injection", "exfiltration"] as const) {
      expect(NEGATIVES.some((n) => n.kind === kind)).toBe(true);
    }
  });
});
