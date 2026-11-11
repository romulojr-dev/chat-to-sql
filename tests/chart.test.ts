import { describe, expect, it } from "vitest";
import { selectChart } from "../lib/chart/select";

const cats = (n: number) => Array.from({ length: n }, (_, i) => [`cat${i}`, String(i + 1)]);

describe("selectChart: single value", () => {
  it("shows a number card for one numeric value", () => {
    expect(selectChart(["n"], [["99441"]])).toEqual({ type: "number", label: "n", value: 99441 });
  });

  it("handles decimals", () => {
    expect(selectChart(["avg_price"], [["120.65"]])).toEqual({ type: "number", label: "avg_price", value: 120.65 });
  });

  it("returns null for a non-numeric scalar", () => {
    expect(selectChart(["status"], [["delivered"]])).toBeNull();
  });

  it("returns null for a null scalar", () => {
    expect(selectChart(["n"], [[null]])).toBeNull();
  });
});

describe("selectChart: bar", () => {
  it("categorical + numeric becomes a bar chart with numeric values", () => {
    expect(
      selectChart(["order_status", "orders"], [["delivered", "96478"], ["shipped", "1107"]]),
    ).toEqual({
      type: "bar",
      xLabel: "order_status",
      yLabel: "orders",
      data: [
        { x: "delivered", y: 96478 },
        { x: "shipped", y: 1107 },
      ],
    });
  });

  it("finds the measure when it comes first", () => {
    const spec = selectChart(["orders", "order_status"], [["5", "a"], ["3", "b"]]);
    expect(spec).toMatchObject({ type: "bar", xLabel: "order_status", yLabel: "orders" });
  });

  it("allows exactly 20 categories but not 21", () => {
    expect(selectChart(["c", "n"], cats(20))).toMatchObject({ type: "bar" });
    expect(selectChart(["c", "n"], cats(21))).toBeNull();
  });

  it("treats two numeric columns as label + value (e.g. review_score, avg)", () => {
    expect(selectChart(["review_score", "avg_price"], [[1, "100.5"], [2, "90.1"]])).toMatchObject({
      type: "bar",
      data: [
        { x: "1", y: 100.5 },
        { x: "2", y: 90.1 },
      ],
    });
  });

  it("supports boolean labels", () => {
    expect(selectChart(["late", "n"], [[true, 5], [false, 9]])).toMatchObject({
      type: "bar",
      data: [
        { x: "true", y: 5 },
        { x: "false", y: 9 },
      ],
    });
  });

  it("keeps null measures as gaps but rejects an all-null measure", () => {
    expect(selectChart(["c", "n"], [["a", "1"], ["b", null]])).toMatchObject({
      data: [
        { x: "a", y: 1 },
        { x: "b", y: null },
      ],
    });
    expect(selectChart(["c", "n"], [["a", null], ["b", null]])).toBeNull();
  });

  it("labels null categories", () => {
    expect(selectChart(["c", "n"], [[null, "1"], ["b", "2"]])).toMatchObject({
      data: [{ x: "(null)", y: 1 }, { x: "b", y: 2 }],
    });
  });

  it("does not treat zero-padded ids like zip codes as numbers", () => {
    expect(selectChart(["zip", "n"], [["01037", "5"], ["02040", "7"]])).toMatchObject({
      type: "bar",
      xLabel: "zip",
    });
  });
});

describe("selectChart: line", () => {
  it("date + numeric becomes a line chart sorted by date", () => {
    expect(
      selectChart(["month", "orders"], [["2018-02-01 00:00:00", "7"], ["2018-01-01 00:00:00", "5"]]),
    ).toEqual({
      type: "line",
      xLabel: "month",
      yLabel: "orders",
      data: [
        { x: "2018-01-01", y: 5 },
        { x: "2018-02-01", y: 7 },
      ],
    });
  });

  it("accepts plain dates, year-month labels, and ISO timestamps", () => {
    for (const x of ["2018-01-05", "2018-01", "2018-01-05T10:30:00.000Z"]) {
      expect(selectChart(["d", "n"], [[x, 1], [x.replace("2018", "2019"), 2]])).toMatchObject({ type: "line" });
    }
  });

  it("keeps the time part when it is not midnight", () => {
    const spec = selectChart(["t", "n"], [["2018-01-01 10:30:00", 1], ["2018-01-01 11:30:00", 2]]);
    expect(spec).toMatchObject({ data: [{ x: "2018-01-01 10:30:00" }, { x: "2018-01-01 11:30:00" }] });
  });

  it("needs at least two points", () => {
    expect(selectChart(["d", "n"], [["2018-01-01", 1]])).toBeNull();
  });
});

describe("selectChart: table only", () => {
  it("returns null for no rows", () => {
    expect(selectChart(["a", "b"], [])).toBeNull();
  });

  it("returns null for a single two-column row", () => {
    expect(selectChart(["c", "n"], [["a", 1]])).toBeNull();
  });

  it("returns null for three or more columns", () => {
    expect(selectChart(["a", "b", "c"], [["x", 1, 2], ["y", 3, 4]])).toBeNull();
  });

  it("returns null when no column is numeric", () => {
    expect(selectChart(["a", "b"], [["x", "y"], ["z", "w"]])).toBeNull();
  });

  it("returns null when the measure mixes numbers and text", () => {
    expect(selectChart(["c", "n"], [["a", "1"], ["b", "oops"]])).toBeNull();
  });

  it("returns null for scientific notation strings rather than guessing", () => {
    expect(selectChart(["c", "n"], [["a", "1e5"], ["b", "2e5"]])).toBeNull();
  });
});
