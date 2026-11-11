import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/sql/execute", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/sql/execute")>();
  return { ...actual, executeReadOnly: vi.fn(actual.executeReadOnly) };
});

import { POST } from "../app/api/run/route";
import { executeReadOnly, QueryError } from "../lib/sql/execute";

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

beforeEach(() => {
  vi.mocked(executeReadOnly).mockClear();
});

describe("POST /api/run: rejects bad input before touching the database", () => {
  it("400 on invalid JSON", async () => {
    const res = await post("{not json");
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("bad_request");
  });

  it("400 when sql is missing or not a string", async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ sql: 42 })).status).toBe(400);
  });

  it("400 when sql is too long", async () => {
    const res = await post({ sql: `SELECT ${"1,".repeat(5000)}1` });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("too_long");
  });

  it.each([
    ["DROP TABLE orders", "not_select"],
    ["SELECT 1; DROP TABLE orders", "multiple_statements"],
    ["SELECT pg_sleep(10)", "function_not_allowed"],
    ["SELECT * FROM pg_roles", "table_not_allowed"],
  ])("400 and a reason for blocked SQL: %s", async (sql, code) => {
    const res = await post({ sql });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe(code);
    expect(typeof body.error.message).toBe("string");
    expect(executeReadOnly).not.toHaveBeenCalled();
  });
});

describe("POST /api/run: maps execution failures", () => {
  it("408 on timeout", async () => {
    vi.mocked(executeReadOnly).mockRejectedValueOnce(new QueryError("timeout", "too slow"));
    const res = await post({ sql: "SELECT 1" });
    expect(res.status).toBe(408);
    expect((await res.json()).error.code).toBe("timeout");
  });

  it("400 on a database error, with its message", async () => {
    vi.mocked(executeReadOnly).mockRejectedValueOnce(new QueryError("database", 'column "x" does not exist'));
    const res = await post({ sql: "SELECT 1" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: { code: "database", message: 'column "x" does not exist' } });
  });

  it("500 with a generic message on unexpected errors, never leaking internals", async () => {
    vi.mocked(executeReadOnly).mockRejectedValueOnce(new Error("connect ECONNREFUSED postgres://user:secret@host"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post({ sql: "SELECT 1" });
    expect(res.status).toBe(500);
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain("secret");
    expect(text).not.toContain("ECONNREFUSED");
    spy.mockRestore();
  });
});

describe.skipIf(!process.env.DATABASE_URL)("POST /api/run (integration, real DB)", () => {
  it("200 with the documented response shape", async () => {
    const res = await post({
      sql: "SELECT order_status, count(*) AS orders FROM orders GROUP BY 1 ORDER BY 2 DESC",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.columns).toEqual(["order_status", "orders"]);
    expect(body.rowCount).toBe(body.rows.length);
    expect(body.rows[0][0]).toBe("delivered");
    expect(body.truncated).toBe(false);
    expect(typeof body.durationMs).toBe("number");
    expect(body.chart).toBeNull();
  }, 30_000);
});
