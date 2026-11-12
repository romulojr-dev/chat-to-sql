/**
 * Token pricing in micro-dollars per token (numerically equal to dollars per
 * million tokens). Integers keep the shared counters exact.
 * Source: the model price table in the claude-api skill (checked 2026-11-12).
 * Prompts over 100K tokens cost more on Haiku 5.5; ours are ~2.4K.
 */
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-fable-5-2": { input: 8, output: 40 },
};

/** Unknown models are priced at least as high as any known one, so a model swap cannot dodge the cap. */
const UNKNOWN_MODEL_PRICE = { input: 10, output: 50 };

export type TokenUsage = { inputTokens: number; outputTokens: number };

export function costMicroUsd(model: string, usage: TokenUsage): number {
  const p = PRICES[model] ?? UNKNOWN_MODEL_PRICE;
  return Math.ceil(usage.inputTokens * p.input + usage.outputTokens * p.output);
}

/**
 * What to hold back before the call. Deliberately above a typical request
 * (~2.4K in, ~300 out); the difference is released when the call is settled.
 */
export function estimateReserveMicro(model: string): number {
  return costMicroUsd(model, { inputTokens: 3000, outputTokens: 2000 });
}
