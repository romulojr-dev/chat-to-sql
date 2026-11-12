import { costMicroUsd, estimateReserveMicro, type TokenUsage } from "./cost";
import { checkRate, clientIp, reserveSpend, settleSpend } from "./limits";
import { MemoryStore, upstashFromEnv, type CounterStore } from "./store";

/**
 * Layer 6 of the safety design (see SPEC.md): per-visitor rate limits on both
 * routes and a hard daily spend cap on the LLM route. Everything is tunable by
 * env var. Design rules that protect the Anthropic key:
 *  - suggest FAILS CLOSED: no shared store on Vercel, or the store is down, means refuse.
 *  - run falls back to per-instance limits so the demo's database stays protected and usable.
 */

export type LimitsConfig = {
  suggestPerMin: number;
  suggestPerDay: number;
  runPerMin: number;
  runPerDay: number;
  dailyCapMicro: number;
};

function positive(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function loadLimitsConfig(env: Record<string, string | undefined> = process.env): LimitsConfig {
  return {
    suggestPerMin: positive(env.SUGGEST_PER_MIN, 10),
    suggestPerDay: positive(env.SUGGEST_PER_DAY, 100),
    runPerMin: positive(env.RUN_PER_MIN, 30),
    runPerDay: positive(env.RUN_PER_DAY, 300),
    dailyCapMicro: Math.round(positive(env.DAILY_SPEND_CAP_USD, 0.5) * 1_000_000),
  };
}

export type GuardKind = "suggest" | "run";
export type Settle = (outcome: { model: string; usage?: TokenUsage }) => Promise<void>;
export type GuardResult = { ok: true; settle: Settle } | { ok: false; response: Response };

type Deps = {
  durable: CounterStore | null;
  volatile: CounterStore;
  /** True on Vercel: a per-instance store is not a real protection for the paid LLM route. */
  requireDurable: boolean;
  config: LimitsConfig;
  now: () => number;
};

function deny(status: number, code: string, message: string, retryAfterSec?: number): GuardResult {
  const headers = retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined;
  return { ok: false, response: Response.json({ error: { code, message } }, { status, headers }) };
}

const noopSettle: Settle = async () => {};

export function createGuard(deps: Deps) {
  const { config } = deps;

  async function rateLimited(store: CounterStore, kind: GuardKind, id: string): Promise<number | null> {
    const perMin = kind === "suggest" ? config.suggestPerMin : config.runPerMin;
    const perDay = kind === "suggest" ? config.suggestPerDay : config.runPerDay;
    const nowMs = deps.now();
    const minute = await checkRate(store, { scope: kind, id, limit: perMin, windowSec: 60, nowMs });
    if (!minute.allowed) return minute.retryAfterSec;
    const day = await checkRate(store, { scope: kind, id, limit: perDay, windowSec: 86_400, nowMs });
    return day.allowed ? null : day.retryAfterSec;
  }

  async function run(store: CounterStore, request: Request, kind: GuardKind, model?: string): Promise<GuardResult> {
    const retry = await rateLimited(store, kind, clientIp(request.headers));
    if (retry !== null) {
      return deny(429, "rate_limited", "You're going a bit fast. Please wait a moment and try again.", retry);
    }
    if (kind === "run" || !model) return { ok: true, settle: noopSettle };

    const reservation = await reserveSpend(store, {
      estimateMicro: estimateReserveMicro(model),
      capMicro: config.dailyCapMicro,
      nowMs: deps.now(),
    });
    if (!reservation.allowed) {
      return deny(503, "budget_exhausted", "This free demo has reached its daily limit to keep costs down. Please come back tomorrow.");
    }
    return {
      ok: true,
      settle: async ({ model: usedModel, usage }) => {
        try {
          await settleSpend(store, reservation, usage ? costMicroUsd(usedModel, usage) : 0);
        } catch (e) {
          // Leaving the reservation in place over-counts, which is the safe direction.
          console.error("limits.settle_failed", e);
        }
      },
    };
  }

  return async function guard(request: Request, kind: GuardKind, model?: string): Promise<GuardResult> {
    const unavailable = () =>
      deny(503, "limits_unavailable", "The demo is temporarily unavailable. Please try again later.");

    if (kind === "suggest") {
      const store = deps.durable ?? (deps.requireDurable ? null : deps.volatile);
      if (!store) {
        console.error("limits.no_durable_store: refusing /api/suggest");
        return unavailable();
      }
      try {
        return await run(store, request, kind, model);
      } catch (e) {
        console.error("limits.store_error: failing closed", e);
        return unavailable();
      }
    }

    if (deps.durable) {
      try {
        return await run(deps.durable, request, kind);
      } catch (e) {
        console.error("limits.store_error: run falls back to per-instance limits", e);
      }
    }
    return run(deps.volatile, request, kind);
  };
}

// Module-level instance: the volatile store must persist across requests in a warm instance.
export const guard = createGuard({
  durable: upstashFromEnv(),
  volatile: new MemoryStore(),
  requireDurable: process.env.VERCEL === "1",
  config: loadLimitsConfig(),
  now: () => Date.now(),
});
