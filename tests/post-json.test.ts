import { afterEach, describe, expect, it, vi } from "vitest";
import { postJson } from "../lib/client/post-json";

const signal = new AbortController().signal;

function mockFetch(response: Response | Error) {
  const fn = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("postJson", () => {
  it("returns parsed data on success and posts JSON", async () => {
    const fn = mockFetch(Response.json({ sql: "SELECT 1" }));
    expect(await postJson("/api/x", { q: 1 }, signal)).toEqual({ ok: true, data: { sql: "SELECT 1" } });
    expect(fn).toHaveBeenCalledWith(
      "/api/x",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ q: 1 }), signal }),
    );
  });

  it("passes through the API's own error code and message", async () => {
    mockFetch(Response.json({ error: { code: "cannot_answer", message: "Not in this data." } }, { status: 422 }));
    expect(await postJson("/api/x", {}, signal)).toEqual({
      ok: false,
      code: "cannot_answer",
      message: "Not in this data.",
    });
  });

  it.each([
    [429, "rate_limited", /too many requests/i],
    [503, "unavailable", /temporarily unavailable/i],
    [504, "timeout", /took too long/i],
    [408, "timeout", /took too long/i],
    [500, "unknown", /something went wrong/i],
  ])("gives a friendly message for a bare HTTP %i with no JSON body", async (status, code, message) => {
    mockFetch(new Response("<html>Gateway error</html>", { status }));
    const r = await postJson("/api/x", {}, signal);
    expect(r).toMatchObject({ ok: false, code });
    if (!r.ok) {
      expect(r.message).toMatch(message);
      expect(r.message).not.toContain("<html>");
    }
  });

  it("uses the friendly message when a 429 JSON body has no error field", async () => {
    mockFetch(Response.json({}, { status: 429 }));
    expect(await postJson("/api/x", {}, signal)).toMatchObject({ ok: false, code: "rate_limited" });
  });

  it("treats a 200 response that contains an error object as an error", async () => {
    mockFetch(Response.json({ error: { code: "database", message: "Bad column." } }));
    expect(await postJson("/api/x", {}, signal)).toEqual({ ok: false, code: "database", message: "Bad column." });
  });

  it("lets network failures and aborts propagate to the caller", async () => {
    mockFetch(new TypeError("Failed to fetch"));
    await expect(postJson("/api/x", {}, signal)).rejects.toThrow(TypeError);
  });
});
