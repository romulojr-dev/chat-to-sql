import { describe, expect, it } from "vitest";
import { costMicroUsd, estimateReserveMicro } from "../lib/limits/cost";
import { checkRate, clientIp, reserveSpend, settleSpend } from "../lib/limits/limits";
import { MemoryStore } from "../lib/limits/store";

const T0 = Date.UTC(2026, 10, 12, 10, 0, 0); // fixed clock: 2026-11-12 10:00:00 UTC

describe("checkRate (fixed windows)", () => {
  const args = { scope: "suggest", id: "1.2.3.4", limit: 3, windowSec: 60 };

  it("allows up to the limit then denies, with a retry hint", async () => {
    const store = new MemoryStore();
    for (let i = 0; i < 3; i++) {
      expect((await checkRate(store, { ...args, nowMs: T0 + i * 1000 })).allowed).toBe(true);
    }
    const denied = await checkRate(store, { ...args, nowMs: T0 + 5000 });
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSec).toBe(55); // window ends at T0+60s
  });

  it("starts a fresh window afterwards", async () => {
    const store = new MemoryStore();
    for (let i = 0; i < 4; i++) await checkRate(store, { ...args, nowMs: T0 });
    expect((await checkRate(store, { ...args, nowMs: T0 + 60_000 })).allowed).toBe(true);
  });

  it("counts each visitor and each scope separately", async () => {
    const store = new MemoryStore();
    for (let i = 0; i < 4; i++) await checkRate(store, { ...args, nowMs: T0 });
    expect((await checkRate(store, { ...args, id: "9.9.9.9", nowMs: T0 })).allowed).toBe(true);
    expect((await checkRate(store, { ...args, scope: "run", nowMs: T0 })).allowed).toBe(true);
  });

  it("never reports a retry time below one second", async () => {
    const store = new MemoryStore();
    for (let i = 0; i < 4; i++) await checkRate(store, { ...args, nowMs: T0 + 59_900 });
    expect((await checkRate(store, { ...args, nowMs: T0 + 59_900 })).retryAfterSec).toBeGreaterThanOrEqual(1);
  });
});

describe("daily spend cap", () => {
  const cap = 1000; // micro-dollars

  it("reserves until the cap is reached, then denies and rolls back its own reservation", async () => {
    const store = new MemoryStore();
    expect((await reserveSpend(store, { estimateMicro: 400, capMicro: cap, nowMs: T0 })).allowed).toBe(true);
    expect((await reserveSpend(store, { estimateMicro: 400, capMicro: cap, nowMs: T0 })).allowed).toBe(true);
    const third = await reserveSpend(store, { estimateMicro: 400, capMicro: cap, nowMs: T0 });
    expect(third.allowed).toBe(false);
    // The denied reservation was refunded: 800 of 1000 is used, so 200 still fits.
    expect((await reserveSpend(store, { estimateMicro: 200, capMicro: cap, nowMs: T0 })).allowed).toBe(true);
  });

  it("concurrent requests cannot overshoot the cap", async () => {
    const store = new MemoryStore();
    const results = await Promise.all(
      Array.from({ length: 10 }, () => reserveSpend(store, { estimateMicro: 300, capMicro: cap, nowMs: T0 })),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(3); // 3 x 300 = 900 <= 1000
  });

  it("settling replaces the estimate with the actual cost", async () => {
    const store = new MemoryStore();
    const r = await reserveSpend(store, { estimateMicro: 900, capMicro: cap, nowMs: T0 });
    if (!r.allowed) throw new Error("expected allowed");
    await settleSpend(store, r, 100); // the call was cheap: 800 is released
    expect((await reserveSpend(store, { estimateMicro: 800, capMicro: cap, nowMs: T0 })).allowed).toBe(true);
  });

  it("settling with zero refunds a failed call in full", async () => {
    const store = new MemoryStore();
    const r = await reserveSpend(store, { estimateMicro: 1000, capMicro: cap, nowMs: T0 });
    if (!r.allowed) throw new Error("expected allowed");
    await settleSpend(store, r, 0);
    expect((await reserveSpend(store, { estimateMicro: 1000, capMicro: cap, nowMs: T0 })).allowed).toBe(true);
  });

  it("a new UTC day starts a new budget", async () => {
    const store = new MemoryStore();
    await reserveSpend(store, { estimateMicro: 1000, capMicro: cap, nowMs: T0 });
    expect((await reserveSpend(store, { estimateMicro: 100, capMicro: cap, nowMs: T0 })).allowed).toBe(false);
    expect((await reserveSpend(store, { estimateMicro: 100, capMicro: cap, nowMs: T0 + 24 * 3600_000 })).allowed).toBe(true);
  });
});

describe("costMicroUsd", () => {
  it("prices Haiku 5.5 at $0.10 / $0.50 per million tokens, in whole micro-dollars", () => {
    // The real measured request from the live test: 2360 in, 159 out.
    expect(costMicroUsd("claude-haiku-5-5", { inputTokens: 2360, outputTokens: 159 })).toBe(Math.ceil(2360 * 0.1 + 159 * 0.5));
    expect(costMicroUsd("claude-haiku-5-5", { inputTokens: 1_000_000, outputTokens: 0 })).toBe(100_000);
  });

  it("prices other known models higher", () => {
    const u = { inputTokens: 1000, outputTokens: 1000 };
    expect(costMicroUsd("claude-sonnet-5-5", u)).toBeGreaterThan(costMicroUsd("claude-haiku-5-5", u));
    expect(costMicroUsd("claude-opus-5-5", u)).toBeGreaterThan(costMicroUsd("claude-sonnet-5-5", u));
  });

  it("prices an unknown model at least as high as every known one, so swapping models cannot dodge the cap", () => {
    const u = { inputTokens: 1000, outputTokens: 1000 };
    const known = ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5", "claude-fable-5-2"];
    for (const m of known) {
      expect(costMicroUsd("some-future-model", u)).toBeGreaterThanOrEqual(costMicroUsd(m, u));
    }
  });

  it("reserves more than a typical request costs", () => {
    const typical = costMicroUsd("claude-haiku-5-5", { inputTokens: 2400, outputTokens: 300 });
    expect(estimateReserveMicro("claude-haiku-5-5")).toBeGreaterThan(typical);
  });
});

describe("clientIp", () => {
  const h = (o: Record<string, string>) => new Headers(o);

  it("prefers x-vercel-forwarded-for, then x-forwarded-for, then x-real-ip", () => {
    expect(clientIp(h({ "x-vercel-forwarded-for": "1.1.1.1", "x-forwarded-for": "2.2.2.2" }))).toBe("1.1.1.1");
    expect(clientIp(h({ "x-forwarded-for": "2.2.2.2" }))).toBe("2.2.2.2");
    expect(clientIp(h({ "x-real-ip": "3.3.3.3" }))).toBe("3.3.3.3");
  });

  it("takes the first address of a forwarded list and trims it", () => {
    expect(clientIp(h({ "x-forwarded-for": " 4.4.4.4 , 10.0.0.1" }))).toBe("4.4.4.4");
  });

  it("falls back to one shared bucket when no address is available", () => {
    expect(clientIp(h({}))).toBe("unknown");
  });

  it("rejects junk so it cannot be used to mint unlimited fresh buckets or poison keys", () => {
    expect(clientIp(h({ "x-forwarded-for": "not an ip; DROP" }))).toBe("unknown");
    expect(clientIp(h({ "x-forwarded-for": "a".repeat(200) }))).toBe("unknown");
  });

  it("accepts IPv6", () => {
    expect(clientIp(h({ "x-forwarded-for": "2001:db8::1" }))).toBe("2001:db8::1");
  });
});
