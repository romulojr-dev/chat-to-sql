import { Pool } from "@neondatabase/serverless";
import { describe, expect, it } from "vitest";
import { executeReadOnly, QueryError } from "../lib/sql/execute";
import type { ValidatedSql } from "../lib/sql/validate";

// Deliberately bypasses the validator: these tests prove the database layers
// (read-only transaction, read-only role, timeout) hold on their own.
const raw = (sql: string) => sql as ValidatedSql;

describe.skipIf(!process.env.DATABASE_URL)("executeReadOnly (integration, real DB)", () => {
  it("returns columns, rows and duration", async () => {
    const r = await executeReadOnly(raw("SELECT seller_id, seller_state FROM sellers ORDER BY seller_id LIMIT 3"));
    expect(r.columns).toEqual(["seller_id", "seller_state"]);
    expect(r.rows).toHaveLength(3);
    expect(r.rows[0]).toHaveLength(2);
    expect(r.truncated).toBe(false);
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("caps rows and flags truncation", async () => {
    const r = await executeReadOnly(raw("SELECT * FROM order_items"), { maxRows: 1000 });
    expect(r.rows).toHaveLength(1000);
    expect(r.truncated).toBe(true);
  });

  it("does not flag truncation when the result exactly fits the cap", async () => {
    const r = await executeReadOnly(raw("SELECT * FROM sellers LIMIT 5"), { maxRows: 5 });
    expect(r.rows).toHaveLength(5);
    expect(r.truncated).toBe(false);
  });

  it("runs the SQL as written, including a trailing line comment", async () => {
    const r = await executeReadOnly(raw("SELECT count(*) AS n FROM orders -- trailing comment"));
    expect(r.columns).toEqual(["n"]);
    expect(Number(r.rows[0][0])).toBe(99441);
  });

  it("returns timestamp and date columns as timezone-independent strings", async () => {
    const r = await executeReadOnly(
      raw("SELECT date_trunc('month', order_purchase_timestamp) AS m, order_purchase_timestamp::date AS d FROM orders ORDER BY 1 LIMIT 1"),
    );
    // Not Date objects: a Date would shift with the server's local timezone.
    expect(r.rows[0]).toEqual(["2016-09-01 00:00:00", "2016-09-04"]);
  });

  it("stops slow queries with a timeout error", async () => {
    const started = Date.now();
    await expect(
      executeReadOnly(raw("SELECT count(*) FROM generate_series(1, 1000000000)"), { timeoutMs: 500 }),
    ).rejects.toMatchObject({ name: "QueryError", code: "timeout" });
    expect(Date.now() - started).toBeLessThan(4000);
  });

  it("reports database errors as QueryError without crashing", async () => {
    await expect(executeReadOnly(raw("SELECT nope FROM orders"))).rejects.toBeInstanceOf(QueryError);
  });

  describe("writes fail at the database even if validation is bypassed", () => {
    it.each([
      ["DELETE", "DELETE FROM orders"],
      ["UPDATE", "UPDATE orders SET order_status = 'x'"],
      ["INSERT", "INSERT INTO sellers (seller_id) VALUES ('x')"],
      ["DROP TABLE", "DROP TABLE orders"],
      ["TRUNCATE", "TRUNCATE orders"],
      ["CREATE TABLE", "CREATE TABLE evil (id int)"],
    ])("%s", async (_label, sql) => {
      await expect(executeReadOnly(raw(sql))).rejects.toBeInstanceOf(QueryError);
    });

    it("escaping the read-only transaction with COMMIT still cannot write (role read-only default holds)", async () => {
      await expect(
        executeReadOnly(raw("SELECT 1; COMMIT; DELETE FROM orders")),
      ).rejects.toMatchObject({ name: "QueryError", message: /read-only transaction/ });
    });

    it("grants alone deny writes even with every read-only default switched off", async () => {
      const client = await new Pool({ connectionString: process.env.DATABASE_URL }).connect();
      try {
        await client.query("SET default_transaction_read_only = off");
        await expect(client.query("DELETE FROM orders")).rejects.toThrow(/permission denied/);
        await expect(client.query("DROP TABLE orders")).rejects.toThrow(/must be owner|permission denied/);
        await expect(client.query("CREATE TABLE public.evil (id int)")).rejects.toThrow(/permission denied/);
      } finally {
        client.release(true);
      }
    });

    it("left the data untouched and the pool healthy after all those attempts", async () => {
      const r = await executeReadOnly(raw("SELECT count(*) FROM orders"));
      expect(Number(r.rows[0][0])).toBe(99441);
    });
  });
}, 30_000);
