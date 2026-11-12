import { Redis } from "@upstash/redis";

/**
 * The only storage operations the limiter needs: an atomic increment that sets
 * an expiry, and a read. Keys embed their time bucket, so expiry is just cleanup.
 */
export interface CounterStore {
  incrBy(key: string, by: number, ttlSeconds: number): Promise<number>;
  get(key: string): Promise<number>;
}

/** In-process store: fine for local dev and tests; per-instance (not shared) on serverless. */
export class MemoryStore implements CounterStore {
  private readonly data = new Map<string, { value: number; expiresAt: number }>();

  async incrBy(key: string, by: number, ttlSeconds: number): Promise<number> {
    const now = Date.now();
    const existing = this.data.get(key);
    const value = (existing && existing.expiresAt > now ? existing.value : 0) + by;
    this.data.set(key, { value, expiresAt: now + ttlSeconds * 1000 });
    if (this.data.size > 10_000) this.purge(now);
    return value;
  }

  async get(key: string): Promise<number> {
    const existing = this.data.get(key);
    return existing && existing.expiresAt > Date.now() ? existing.value : 0;
  }

  private purge(now: number) {
    for (const [k, v] of this.data) if (v.expiresAt <= now) this.data.delete(k);
  }
}

/** Shared store backed by Upstash Redis (REST), so limits hold across serverless instances. */
export class UpstashStore implements CounterStore {
  constructor(private readonly redis: Redis) {}

  async incrBy(key: string, by: number, ttlSeconds: number): Promise<number> {
    const pipeline = this.redis.pipeline();
    pipeline.incrby(key, by);
    pipeline.expire(key, ttlSeconds);
    const [value] = await pipeline.exec<[number, number]>();
    return value;
  }

  async get(key: string): Promise<number> {
    return Number((await this.redis.get<number>(key)) ?? 0);
  }
}

/**
 * Upstash credentials, if configured. Vercel's Upstash integration may inject
 * either the UPSTASH_REDIS_REST_* or the legacy KV_REST_API_* names.
 */
export function upstashFromEnv(env: Record<string, string | undefined> = process.env): UpstashStore | null {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  return url && token ? new UpstashStore(new Redis({ url, token })) : null;
}
