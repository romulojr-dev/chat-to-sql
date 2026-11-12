import { describe, expect, it } from "vitest";
import { createGuard, loadLimitsConfig, type LimitsConfig } from "../lib/limits/guard";
import { MemoryStore, type CounterStore } from "../lib/limits/store";

const T0 = Date.UTC(2026, 10, 12, 10, 0, 0);
const config: LimitsConfig = {
  suggestPerMin: 3,
  suggestPerDay: 5,
  runPerMin: 4,
  runPerDay: 6,
  dailyCapMicro: 10_000,
};
const req = (ip = "1.2.3.4") => new Request("http://x/api", { method: "POST", headers: { "x-forwarded-for": ip } });
const MODEL = "claude-haiku-5-5";

class BrokenStore implements CounterStore {
  async incrBy(): Promise<number> {
    throw new Error("redis down");
  }
  async get(): Promise<number> {
    throw new Error("redis down");
  }
}

function make(opts: Partial<Parameters<typeof createGuard>[0]> = {}) {
  let now = T0;
  const guard = createGuard({
    durable: new MemoryStore(),
    volatile: new MemoryStore(),
    requireDurable: false,
    config,
    now: () => now,
    ...opts,
  });
  return { guard, advance: (ms: number) => (now += ms) };
}

describe("loadLimitsConfig", () => {
  it("has sensible defaults", () => {
    const c = loadLimitsConfig({});
    expect(c).toMatchObject({ suggestPerMin: 10, runPerMin: 30 });
    expect(c.dailyCapMicro).toBe(500_000); // $0.50
  });

  it("reads overrides and ignores junk", () => {
    expect(loadLimitsConfig({ DAILY_SPEND_CAP_USD: "2", SUGGEST_PER_MIN: "5" })).toMatchObject({
      dailyCapMicro: 2_000_000,
      suggestPerMin: 5,
    });
    expect(loadLimitsConfig({ DAILY_SPEND_CAP_USD: "abc", SUGGEST_PER_MIN: "-3" })).toMatchObject({
      dailyCapMicro: 500_000,
      suggestPerMin: 10,
    });
  });
});

describe("rate limits", () => {
  it("allows requests up to the per-minute limit then answers 429 with Retry-After", async () => {
    const { guard } = make();
    for (let i = 0; i < 3; i++) expect((await guard(req(), "suggest", MODEL)).ok).toBe(true);
    const denied = await guard(req(), "suggest", MODEL);
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.response.status).toBe(429);
      expect(Number(denied.response.headers.get("retry-after"))).toBeGreaterThan(0);
      expect((await denied.response.json()).error.code).toBe("rate_limited");
    }
  });

  it("recovers after the window passes", async () => {
    const { guard, advance } = make();
    for (let i = 0; i < 4; i++) await guard(req(), "suggest", MODEL);
    advance(61_000);
    expect((await guard(req(), "suggest", MODEL)).ok).toBe(true);
  });

  it("enforces the per-day limit even when the per-minute limit would allow", async () => {
    const { guard, advance } = make();
    for (let i = 0; i < 5; i++) {
      expect((await guard(req(), "suggest", MODEL)).ok).toBe(true);
      advance(61_000); // new minute each time
    }
    expect((await guard(req(), "suggest", MODEL)).ok).toBe(false);
  });

  it("limits visitors independently, and run separately from suggest", async () => {
    const { guard } = make();
    for (let i = 0; i < 4; i++) await guard(req("1.1.1.1"), "suggest", MODEL);
    expect((await guard(req("2.2.2.2"), "suggest", MODEL)).ok).toBe(true);
    expect((await guard(req("1.1.1.1"), "run")).ok).toBe(true);
  });
});

describe("daily spend cap (suggest only)", () => {
  it("refuses with budget_exhausted once the day's budget is reserved", async () => {
    // The Haiku reserve is 1300 micro-dollars (3000 in x 0.1 + 2000 out x 0.5); a cap of 2700 fits two.
    const { guard } = make({ config: { ...config, dailyCapMicro: 2700, suggestPerMin: 99, suggestPerDay: 99 } });
    expect((await guard(req("1.1.1.1"), "suggest", MODEL)).ok).toBe(true);
    expect((await guard(req("2.2.2.2"), "suggest", MODEL)).ok).toBe(true);
    const denied = await guard(req("3.3.3.3"), "suggest", MODEL);
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.response.status).toBe(503);
      expect((await denied.response.json()).error.code).toBe("budget_exhausted");
    }
  });

  it("settling with real usage releases the unused reservation", async () => {
    const { guard } = make({ config: { ...config, dailyCapMicro: 2700, suggestPerMin: 99, suggestPerDay: 99 } });
    for (const ip of ["1.1.1.1", "2.2.2.2", "3.3.3.3", "4.4.4.4"]) {
      const g = await guard(req(ip), "suggest", MODEL);
      expect(g.ok).toBe(true); // each cheap call frees its hold, so all four fit
      if (g.ok) await g.settle({ model: MODEL, usage: { inputTokens: 2400, outputTokens: 150 } });
    }
  });

  it("settling a failed call with no usage refunds the whole reservation", async () => {
    const { guard } = make({ config: { ...config, dailyCapMicro: 1400, suggestPerMin: 99, suggestPerDay: 99 } });
    for (const ip of ["1.1.1.1", "2.2.2.2", "3.3.3.3"]) {
      const g = await guard(req(ip), "suggest", MODEL);
      expect(g.ok).toBe(true);
      if (g.ok) await g.settle({ model: MODEL });
    }
  });

  it("does not apply the spend cap to run", async () => {
    const { guard } = make({ config: { ...config, dailyCapMicro: 1 } });
    expect((await guard(req(), "run")).ok).toBe(true);
  });
});

describe("failure modes", () => {
  it("on Vercel without a shared store, suggest is refused (the API key stays protected)", async () => {
    const { guard } = make({ durable: null, requireDurable: true });
    const denied = await guard(req(), "suggest", MODEL);
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.response.status).toBe(503);
      expect((await denied.response.json()).error.code).toBe("limits_unavailable");
    }
  });

  it("on Vercel without a shared store, run still works with per-instance limits", async () => {
    const { guard } = make({ durable: null, requireDurable: true });
    for (let i = 0; i < 4; i++) expect((await guard(req(), "run")).ok).toBe(true);
    expect((await guard(req(), "run")).ok).toBe(false); // the volatile fallback still limits
  });

  it("locally with no shared store, suggest uses the in-memory store", async () => {
    const { guard } = make({ durable: null, requireDurable: false });
    expect((await guard(req(), "suggest", MODEL)).ok).toBe(true);
  });

  it("if the shared store is down, suggest fails closed", async () => {
    const { guard } = make({ durable: new BrokenStore() });
    const denied = await guard(req(), "suggest", MODEL);
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.response.status).toBe(503);
  });

  it("if the shared store is down, run falls back to per-instance limits", async () => {
    const { guard } = make({ durable: new BrokenStore() });
    expect((await guard(req(), "run")).ok).toBe(true);
  });
});
