import { describe, expect, it } from "vitest";
import { validateReadOnlySql } from "../lib/sql/validate";
import safetySet from "./safety-set.json";
import allowedSet from "./allowed-set.json";

describe("validateReadOnlySql: blocked inputs", () => {
  it.each(safetySet.map((c) => [c.why, c.sql]))("blocks: %s", async (_why, sql) => {
    const r = await validateReadOnlySql(sql);
    expect(r.ok).toBe(false);
  });

  it("has at least 30 blocked cases", () => {
    expect(safetySet.length).toBeGreaterThanOrEqual(30);
  });

  it("blocks oversized input", async () => {
    const r = await validateReadOnlySql(`SELECT ${"1,".repeat(5000)}1`);
    expect(r).toMatchObject({ ok: false, code: "too_long" });
  });

  it("reports a stable code and plain-language reason", async () => {
    const r = await validateReadOnlySql("DELETE FROM orders");
    expect(r).toMatchObject({ ok: false, code: "not_select" });
    if (!r.ok) expect(r.reason.length).toBeGreaterThan(10);
  });

  it("flags stacked statements specifically", async () => {
    expect(await validateReadOnlySql("SELECT 1; SELECT 2")).toMatchObject({
      ok: false,
      code: "multiple_statements",
    });
  });
});

describe("validateReadOnlySql: allowed queries", () => {
  it.each(allowedSet.map((c) => [c.why, c.sql]))("allows: %s", async (_why, sql) => {
    const r = await validateReadOnlySql(sql);
    expect(r).toMatchObject({ ok: true });
  });

  it("strips trailing semicolons and whitespace from the returned SQL", async () => {
    expect(await validateReadOnlySql("  SELECT 1 ;; \n")).toEqual({ ok: true, sql: "SELECT 1" });
  });
});
