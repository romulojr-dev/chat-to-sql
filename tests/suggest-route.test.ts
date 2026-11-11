import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/llm/suggest", () => ({ suggestSql: vi.fn() }));

import { POST } from "../app/api/suggest/route";
import { suggestSql, type SuggestResult } from "../lib/llm/suggest";

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/suggest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

const usage = { inputTokens: 1200, outputTokens: 80 };
const reply = (r: SuggestResult) => vi.mocked(suggestSql).mockResolvedValueOnce(r);

beforeEach(() => {
  vi.mocked(suggestSql).mockReset();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/suggest: input", () => {
  it("400 on invalid JSON, without calling the model", async () => {
    const res = await post("{nope");
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("bad_request");
    expect(suggestSql).not.toHaveBeenCalled();
  });

  it("400 when question is missing or not a string", async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ question: 5 })).status).toBe(400);
    expect(suggestSql).not.toHaveBeenCalled();
  });

  it("400 with a friendly message when the question is empty or too long", async () => {
    reply({ ok: false, code: "invalid_question", reason: "Please type a question." });
    const res = await post({ question: "   " });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: { code: "invalid_question", message: "Please type a question." } });
  });
});

describe("POST /api/suggest: success", () => {
  it("returns validated sql, the explanation and token usage", async () => {
    reply({ ok: true, sql: "SELECT count(*) AS n FROM orders;", explanation: "Counts orders.", model: "m", usage });
    const res = await post({ question: "How many orders?" });
    expect(res.status).toBe(200);
    // Trailing semicolon is stripped by the validator: this is the validated form.
    expect(await res.json()).toEqual({ sql: "SELECT count(*) AS n FROM orders", explanation: "Counts orders.", usage });
    expect(suggestSql).toHaveBeenCalledWith("How many orders?");
  });
});

describe("POST /api/suggest: unusable model output", () => {
  it.each([
    ["cannot_answer", 422],
    ["refused", 422],
    ["invalid_output", 422],
    ["unavailable", 503],
  ] as const)("maps %s to %i with the model's reason", async (code, status) => {
    reply({ ok: false, code, reason: "Explained in plain language.", usage });
    const res = await post({ question: "q" });
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error: { code, message: "Explained in plain language." } });
  });

  it.each([
    ["a write", "DELETE FROM orders"],
    ["stacked statements", "SELECT 1; DROP TABLE orders"],
    ["a forbidden function", "SELECT pg_sleep(30)"],
    ["a system table", "SELECT * FROM pg_roles"],
  ])("422 and never returns the SQL when the model produced %s", async (_label, sql) => {
    reply({ ok: true, sql, explanation: "Trust me.", model: "m", usage });
    const res = await post({ question: "q" });
    expect(res.status).toBe(422);
    const text = JSON.stringify(await res.json());
    expect(text).toContain("unsafe_sql");
    expect(text).not.toContain(sql);
    expect(text).not.toContain("Trust me");
  });

  it("500 with a generic message on unexpected errors", async () => {
    vi.mocked(suggestSql).mockRejectedValueOnce(new Error("secret internals sk-ant-xyz"));
    const res = await post({ question: "q" });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("sk-ant-xyz");
  });
});
