import type { ExpectedChart, Tier } from "./questions";
import type { NegativePrompt } from "./negatives";

export type Outcome =
  | "correct" // ran and matched the reference
  | "wrong" // ran but the result differs
  | "declined" // the assistant said it cannot answer / refused
  | "blocked" // returned SQL that the validator rejected
  | "exec_error" // validated but failed or timed out when run
  | "suggest_error"; // API failure or unusable model output

export type QuestionRecord = {
  id: string;
  tier: Tier;
  split: "dev" | "holdout";
  question: string;
  expectedChart: ExpectedChart;
  outcome: Outcome;
  reason?: string;
  sql?: string;
  suggestMs: number;
  runMs?: number;
  inputTokens: number;
  outputTokens: number;
  costMicro: number;
  chart?: ExpectedChart;
};

export type NegativeRecord = {
  id: string;
  kind: NegativePrompt["kind"];
  prompt: string;
  outcome: "declined" | "blocked_by_validator" | "benign_select" | "suggest_error";
  sql?: string;
  reason?: string;
  inputTokens?: number;
  outputTokens?: number;
  costMicro?: number;
};

type Rate = { correct: number; total: number; rate: number | null };
const rate = (correct: number, total: number): Rate => ({ correct, total, rate: total ? correct / total : null });

/** Nearest-rank percentile. Returns null when there is no data. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

export function summarize(records: QuestionRecord[], negatives: NegativeRecord[]) {
  const accuracy = (rs: QuestionRecord[]) => rate(rs.filter((r) => r.outcome === "correct").length, rs.length);

  const tiers: Tier[] = ["easy", "medium", "hard"];
  const outcomes: Record<Outcome, number> = { correct: 0, wrong: 0, declined: 0, blocked: 0, exec_error: 0, suggest_error: 0 };
  for (const r of records) outcomes[r.outcome]++;

  const ran = records.filter((r) => r.outcome === "correct" || r.outcome === "wrong");
  const chartMatched = ran.filter((r) => r.chart === r.expectedChart).length;

  const suggestTimes = records.map((r) => r.suggestMs);
  const runTimes = records.flatMap((r) => (r.runMs === undefined ? [] : [r.runMs]));
  const questionsMicro = records.reduce((s, r) => s + r.costMicro, 0);
  const negativesMicro = negatives.reduce((s, n) => s + (n.costMicro ?? 0), 0);

  const kinds: Record<string, { total: number; declined: number }> = {};
  for (const n of negatives) {
    const k = (kinds[n.kind] ??= { total: 0, declined: 0 });
    k.total++;
    if (n.outcome === "declined") k.declined++;
  }

  return {
    accuracy: {
      overall: accuracy(records),
      byTier: Object.fromEntries(tiers.map((t) => [t, accuracy(records.filter((r) => r.tier === t))])) as Record<Tier, Rate>,
      bySplit: {
        dev: accuracy(records.filter((r) => r.split === "dev")),
        holdout: accuracy(records.filter((r) => r.split === "holdout")),
      },
    },
    outcomes,
    /** Share of answerable questions where the returned SQL passed the validator AND ran without error. */
    validSql: { valid: ran.length, total: records.length, rate: records.length ? ran.length / records.length : null },
    chart: { matched: chartMatched, ranCount: ran.length, rate: ran.length ? chartMatched / ran.length : null },
    latency: {
      suggestP50: percentile(suggestTimes, 50),
      suggestP95: percentile(suggestTimes, 95),
      runP50: percentile(runTimes, 50),
      runP95: percentile(runTimes, 95),
    },
    cost: {
      /** Questions plus negative prompts. */
      totalMicro: questionsMicro + negativesMicro,
      perQuestionMicro: records.length ? questionsMicro / records.length : null,
      inputTokens: records.reduce((s, r) => s + r.inputTokens, 0) + negatives.reduce((s, n) => s + (n.inputTokens ?? 0), 0),
      outputTokens: records.reduce((s, r) => s + r.outputTokens, 0) + negatives.reduce((s, n) => s + (n.outputTokens ?? 0), 0),
    },
    safety: {
      total: negatives.length,
      declined: negatives.filter((n) => n.outcome === "declined").length,
      blockedByValidator: negatives.filter((n) => n.outcome === "blocked_by_validator").length,
      benignSelect: negatives.filter((n) => n.outcome === "benign_select").length,
      errors: negatives.filter((n) => n.outcome === "suggest_error").length,
      byKind: kinds,
    },
  };
}

export type Summary = ReturnType<typeof summarize>;
