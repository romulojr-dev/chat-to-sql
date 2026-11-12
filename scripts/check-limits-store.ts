/**
 * Smoke-tests the Upstash counter store used for rate limits and the spend cap:
 * atomic increments, negative increments (refunds), reads, and key expiry.
 *
 * Usage: npm run limits:check
 * Requires UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (or the KV_REST_API_* names).
 */
import { upstashFromEnv } from "../lib/limits/store";

async function main() {
  const store = upstashFromEnv();
  if (!store) {
    console.error("No Upstash credentials found. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in .env.local.");
    process.exit(1);
  }

  const key = `limits-check:${Date.now()}`;
  const failures: string[] = [];
  const check = (label: string, ok: boolean, detail = "") => {
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? ` (${detail})` : ""}`);
    if (!ok) failures.push(label);
  };

  try {
    console.log("Checking the Upstash store:");
    check("increment from zero", (await store.incrBy(key, 5, 5)) === 5);
    check("increment adds", (await store.incrBy(key, 3, 5)) === 8);
    check("negative increment refunds", (await store.incrBy(key, -2, 5)) === 6);
    check("get reads the value", (await store.get(key)) === 6);
    check("missing key reads as zero", (await store.get(`${key}:missing`)) === 0);

    const concurrent = await Promise.all(Array.from({ length: 10 }, () => store.incrBy(`${key}:c`, 1, 5)));
    check(
      "10 concurrent increments are atomic",
      new Set(concurrent).size === 10 && Math.max(...concurrent) === 10,
      `max=${Math.max(...concurrent)}`,
    );

    await new Promise((r) => setTimeout(r, 6500));
    check("keys expire after their TTL", (await store.get(key)) === 0);
  } catch (e) {
    failures.push("store error");
    console.error("  FAIL  store error:", e instanceof Error ? e.message : e);
  }

  if (failures.length) {
    console.error(`\n${failures.length} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll checks passed. Limits can use this store.");
}

main().then(() => process.exit(0));
