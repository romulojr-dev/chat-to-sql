import type { NegativeRecord, QuestionRecord, Summary } from "./report";

export type ReportMeta = {
  label: string;
  date: string;
  model: string;
  effort: string;
  split: string;
  gitCommit: string;
  promptSha: string;
  questionCount: number;
  negativeCount: number;
};

const pct = (r: { correct?: number; valid?: number; matched?: number; total?: number; ranCount?: number; rate: number | null }) => {
  if (r.rate === null) return "n/a";
  const num = r.correct ?? r.valid ?? r.matched ?? 0;
  const den = r.total ?? r.ranCount ?? 0;
  return `${(r.rate * 100).toFixed(1)}% (${num}/${den})`;
};
const usd = (micro: number | null) => (micro === null ? "n/a" : `$${(micro / 1e6).toFixed(micro >= 10_000 ? 4 : 5)}`);
const ms = (v: number | null) => (v === null ? "n/a" : `${Math.round(v).toLocaleString("en-US")} ms`);
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();

export function renderMarkdown(meta: ReportMeta, s: Summary, records: QuestionRecord[], negatives: NegativeRecord[]): string {
  const misses = records.filter((r) => r.outcome !== "correct");
  const lines: string[] = [
    `# Eval report: ${meta.label}`,
    "",
    `- **Model:** \`${meta.model}\`, effort: ${meta.effort}`,
    `- **Date:** ${meta.date}, code at commit \`${meta.gitCommit}\`, system prompt hash \`${meta.promptSha}\``,
    `- **Questions run:** ${meta.questionCount} (${meta.split}) plus ${meta.negativeCount} safety prompts`,
    "",
    `> These numbers come from our own ${meta.questionCount}-question test set on one dataset. They show how this app behaves on this set, not general text-to-SQL ability.`,
    "",
    "## Accuracy",
    "",
    "| Measure | Result |",
    "|---|---|",
    `| **Execution accuracy** (result matches the reference) | **${pct(s.accuracy.overall)}** |`,
    `| easy | ${pct(s.accuracy.byTier.easy)} |`,
    `| medium | ${pct(s.accuracy.byTier.medium)} |`,
    `| hard | ${pct(s.accuracy.byTier.hard)} |`,
    `| development questions | ${pct(s.accuracy.bySplit.dev)} |`,
    `| held-out questions | ${pct(s.accuracy.bySplit.holdout)} |`,
    `| Valid-SQL rate (passed the validator and ran) | ${pct(s.validSql)} |`,
    `| Chart choice matched (of queries that ran) | ${pct(s.chart)} |`,
    "",
    "## What happened to every question",
    "",
    "| Outcome | Count |",
    "|---|---|",
    ...Object.entries(s.outcomes).map(([k, v]) => `| ${k} | ${v} |`),
    "",
    "## Safety",
    "",
    `Of ${s.safety.total} prompts that ask for something unanswerable or harmful (writes, prompt injection, reading system data):`,
    "",
    `- ${s.safety.declined} declined by the assistant`,
    `- ${s.safety.blockedByValidator} produced SQL that the validator blocked`,
    `- ${s.safety.benignSelect} produced a harmless read-only SELECT (validator-approved; not executed here)`,
    `- ${s.safety.errors} could not be judged because the API call failed`,
    "- 0 produced SQL that would have changed data: the validator, read-only role and read-only transaction all stand in the way regardless of what the model writes.",
    "",
    "## Speed and cost",
    "",
    "| Measure | Result |",
    "|---|---|",
    `| Suggest latency p50 / p95 | ${ms(s.latency.suggestP50)} / ${ms(s.latency.suggestP95)} |`,
    `| Query run time p50 / p95 | ${ms(s.latency.runP50)} / ${ms(s.latency.runP95)} |`,
    `| Cost per question | ${usd(s.cost.perQuestionMicro)} |`,
    `| Total cost of this run | ${usd(s.cost.totalMicro)} (${s.cost.inputTokens.toLocaleString("en-US")} input / ${s.cost.outputTokens.toLocaleString("en-US")} output tokens) |`,
    "",
    `## Questions not answered correctly (${misses.length})`,
    "",
  ];

  if (misses.length === 0) {
    lines.push("None.", "");
  } else {
    lines.push("| ID | Tier | Question | Outcome | Detail |", "|---|---|---|---|---|");
    for (const r of misses) {
      lines.push(`| ${r.id} | ${r.tier} | ${cell(r.question)} | ${r.outcome} | ${cell(r.reason ?? "")} |`);
    }
    lines.push("");
  }
  void negatives;
  return lines.join("\n");
}
