import { describe, expect, it } from "vitest";
import { compareTables, normalizeCell, type Table } from "../evals/compare";

const t = (columns: string[], rows: unknown[][]): Table => ({ columns, rows });
const same = (expected: Table, actual: Table, ordered = false) => compareTables(expected, actual, ordered).match;

describe("normalizeCell", () => {
  it("treats numeric strings and numbers alike", () => {
    expect(normalizeCell("96478")).toBe(96478);
    expect(normalizeCell("120.65")).toBe(120.65);
    expect(normalizeCell(5)).toBe(5);
  });

  it("keeps zero-padded identifiers as text", () => {
    expect(normalizeCell("01037")).toBe("01037");
  });

  it("makes midnight timestamps, plain dates and year-month labels comparable", () => {
    expect(normalizeCell("2017-01-01 00:00:00")).toBe("2017-01-01");
    expect(normalizeCell("2017-01-01T00:00:00.000Z")).toBe("2017-01-01");
    expect(normalizeCell("2017-01-01")).toBe("2017-01-01");
    expect(normalizeCell("2017-01")).toBe("2017-01-01");
  });

  it("keeps a real time of day", () => {
    expect(normalizeCell("2016-09-04 21:15:19")).toBe("2016-09-04 21:15:19");
  });

  it("compares text case-insensitively and trimmed; null stays null", () => {
    expect(normalizeCell("  SP ")).toBe("sp");
    expect(normalizeCell(null)).toBeNull();
    expect(normalizeCell(undefined)).toBeNull();
  });
});

describe("compareTables: values", () => {
  it("matches identical scalars, including string vs number forms", () => {
    expect(same(t(["n"], [["99441"]]), t(["count"], [[99441]]))).toBe(true);
  });

  it("allows small numeric differences (rounding) but not real ones", () => {
    expect(same(t(["a"], [["4.0864206"]]), t(["a"], [["4.09"]]))).toBe(true);
    expect(same(t(["a"], [["120.65"]]), t(["a"], [["120.7"]]))).toBe(true);
    expect(same(t(["a"], [["1255695.13"]]), t(["a"], [["1255695"]]))).toBe(true);
    expect(same(t(["a"], [["4.0864"]]), t(["a"], [["4.5"]]))).toBe(false);
    expect(same(t(["a"], [["96478"]]), t(["a"], [["96000"]]))).toBe(false);
  });

  it("does not accept a fraction for a percentage", () => {
    expect(same(t(["pct"], [["97.02"]]), t(["pct"], [["0.9702"]]))).toBe(false);
  });

  it("compares dates by day across formats", () => {
    expect(same(t(["m", "n"], [["2017-01-01 00:00:00", 800]]), t(["month", "orders"], [["2017-01", "800"]]))).toBe(true);
  });

  it("pairs near-equal values correctly when one actual value is within tolerance of two expected ones", () => {
    // 0.96 is within tolerance of both 1.00 and 0.95; 1.04 only fits 1.00. A greedy match
    // that gives 0.96 to 1.00 first would strand 0.95 and wrongly report a mismatch.
    expect(same(t(["a"], [["1.00"], ["0.95"]]), t(["a"], [["0.96"], ["1.04"]]))).toBe(true);
  });

  it("matches many close averages that were rounded to two decimals (a per-state average)", () => {
    const exact = [4.0493827, 3.7512077, 4.1836735, 4.1818, 4.1792, 4.1843, 4.1497, 4.0396].map((v) => [String(v)]);
    const rounded = exact.map(([v]) => [String(Math.round(Number(v) * 100) / 100)]);
    expect(same(t(["avg"], exact), t(["avg"], [...rounded].reverse()))).toBe(true);
  });

  it("treats null as different from zero or empty", () => {
    expect(same(t(["a"], [[null]]), t(["a"], [["0"]]))).toBe(false);
    expect(same(t(["a"], [[null]]), t(["a"], [[null]]))).toBe(true);
  });

  it("is case-insensitive for text", () => {
    expect(same(t(["s"], [["SP"]]), t(["s"], [["sp"]]))).toBe(true);
  });
});

describe("compareTables: shape", () => {
  const exp = t(["category", "revenue"], [["a", "10"], ["b", "20"]]);

  it("ignores column names and column order", () => {
    expect(same(exp, t(["total", "name"], [["10", "a"], ["20", "b"]]))).toBe(true);
  });

  it("accepts extra helpful columns", () => {
    expect(same(exp, t(["rank", "category", "revenue"], [[1, "a", 10], [2, "b", 20]]))).toBe(true);
  });

  it("rejects a missing column", () => {
    expect(same(exp, t(["category"], [["a"], ["b"]]))).toBe(false);
  });

  it("rejects a different number of rows", () => {
    expect(same(exp, t(["c", "r"], [["a", 10]]))).toBe(false);
    expect(same(exp, t(["c", "r"], [["a", 10], ["b", 20], ["c", 30]]))).toBe(false);
  });

  it("rejects the right numbers attached to the wrong labels", () => {
    expect(same(exp, t(["c", "r"], [["a", 20], ["b", 10]]))).toBe(false);
  });

  it("matches rows regardless of order when order does not matter", () => {
    expect(same(exp, t(["c", "r"], [["b", 20], ["a", 10]]))).toBe(true);
  });

  it("requires the same order when order matters", () => {
    const reversed = t(["c", "r"], [["b", 20], ["a", 10]]);
    expect(same(exp, reversed, true)).toBe(false);
    expect(same(exp, t(["c", "r"], [["a", 10], ["b", 20]]), true)).toBe(true);
  });

  it("treats duplicate rows as a multiset", () => {
    expect(same(t(["x"], [[1], [1], [2]]), t(["x"], [[1], [2], [2]]))).toBe(false);
    expect(same(t(["x"], [[1], [1], [2]]), t(["x"], [[2], [1], [1]]))).toBe(true);
  });

  it("explains why it failed", () => {
    expect(compareTables(exp, t(["c", "r"], [["a", 10]]), false).reason).toMatch(/row/i);
    expect(compareTables(exp, t(["c"], [["a"], ["b"]]), false).reason).toMatch(/column/i);
  });

  it("gives up safely on very wide results instead of exploding", () => {
    const wide = t(Array.from({ length: 12 }, (_, i) => `c${i}`), [Array.from({ length: 12 }, (_, i) => i)]);
    expect(compareTables(t(["a"], [[0]]), wide, false).match).toBe(false);
  });
});
