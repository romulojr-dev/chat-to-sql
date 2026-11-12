import type { CounterStore } from "./store";

/** Fixed-window request counter. Keys embed the window number, so windows reset cleanly. */
export async function checkRate(
  store: CounterStore,
  opts: { scope: string; id: string; limit: number; windowSec: number; nowMs: number },
): Promise<{ allowed: boolean; retryAfterSec: number }> {
  const nowSec = opts.nowMs / 1000;
  const bucket = Math.floor(nowSec / opts.windowSec);
  const key = `rl:${opts.scope}:${opts.windowSec}:${opts.id}:${bucket}`;
  const count = await store.incrBy(key, 1, opts.windowSec * 2);
  return {
    allowed: count <= opts.limit,
    retryAfterSec: Math.max(1, Math.ceil((bucket + 1) * opts.windowSec - nowSec)),
  };
}

export type Reservation = { allowed: true; dayKey: string; reservedMicro: number };

const dayKeyFor = (nowMs: number) => `spend:${new Date(nowMs).toISOString().slice(0, 10)}`; // UTC day

/**
 * Atomically holds back `estimateMicro` of today's budget. Increment-then-check
 * means concurrent requests cannot overshoot the cap; a denied request returns
 * its own hold immediately.
 */
export async function reserveSpend(
  store: CounterStore,
  opts: { estimateMicro: number; capMicro: number; nowMs: number },
): Promise<Reservation | { allowed: false }> {
  const dayKey = dayKeyFor(opts.nowMs);
  const total = await store.incrBy(dayKey, opts.estimateMicro, 3 * 24 * 3600);
  if (total > opts.capMicro) {
    await store.incrBy(dayKey, -opts.estimateMicro, 3 * 24 * 3600);
    return { allowed: false };
  }
  return { allowed: true, dayKey, reservedMicro: opts.estimateMicro };
}

/** Replace the estimate with what the call really cost (0 for a call that failed outright). */
export async function settleSpend(store: CounterStore, r: Reservation, actualMicro: number): Promise<void> {
  const delta = actualMicro - r.reservedMicro;
  if (delta !== 0) await store.incrBy(r.dayKey, delta, 3 * 24 * 3600);
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const IPV6 = /^[0-9a-fA-F:]{2,45}$/;

/**
 * Visitor identity for rate limiting. On Vercel, x-forwarded-for is set by the
 * platform (client-supplied values are overwritten). Anything that doesn't look
 * like an address collapses into one shared bucket, which is the strict choice.
 */
export function clientIp(headers: Headers): string {
  const raw = headers.get("x-vercel-forwarded-for") ?? headers.get("x-forwarded-for") ?? headers.get("x-real-ip") ?? "";
  const first = raw.split(",")[0].trim();
  return IPV4.test(first) || (IPV6.test(first) && first.includes(":")) ? first : "unknown";
}
