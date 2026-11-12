/**
 * Compares eval configurations across several runs. Haiku's sampling cannot be
 * pinned, so one run per setting is noisy: report the mean and the min-max range,
 * and separate questions that are wrong every time from ones that are only flaky.
 *
 * Usage: npm run eval:summary -- v1 v2
 *   reads evals/results/<prefix>-run*.json for each prefix and writes evals/results/SUMMARY.md
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { QuestionRecord, Summary } from "./report";

export type RunData = { records: QuestionRecord[]; summary: Summary; meta?: Record<string, unknown> };
export type Spread = { mean: number | null; min: number | null; max: number | null };

export function spread(values: number[]): Spread {
  if (values.length === 0) return { mean: null, min: null, max: null };
  return { mean: values.reduce((a, b) => a + b, 0) / values.length, min: Math.min(...values), max: Math.max(...values) };
}

const nums = (xs: (number | null)[]) => xs.filter((x): x is number => x !== null);

export function aggregateGroup(runs: RunData[]) {
  const ids = [...new Set(runs.flatMap((r) => r.records.map((q) => q.id)))].sort();
  const correctIn = (id: string) => runs.filter((r) => r.records.find((q) => q.id === id)?.outcome === "correct").length;

  return {
    runs: runs.length,
    overall: spread(nums(runs.map((r) => r.summary.accuracy.overall.rate))),
    easy: spread(nums(runs.map((r) => r.summary.accuracy.byTier.easy.rate))),
    medium: spread(nums(runs.map((r) => r.summary.accuracy.byTier.medium.rate))),
    hard: spread(nums(runs.map((r) => r.summary.accuracy.byTier.hard.rate))),
    dev: spread(nums(runs.map((r) => r.summary.accuracy.bySplit.dev.rate))),
    holdout: spread(nums(runs.map((r) => r.summary.accuracy.bySplit.holdout.rate))),
    validSql: spread(nums(runs.map((r) => r.summary.validSql.rate))),
    chart: spread(nums(runs.map((r) => r.summary.chart.rate))),
    suggestP50: spread(nums(runs.map((r) => r.summary.latency.suggestP50))).mean,
    costPerRunMicro: spread(runs.map((r) => r.summary.cost.totalMicro)).mean,
    correctEveryRun: ids.filter((id) => correctIn(id) === runs.length),
    wrongEveryRun: ids.filter((id) => correctIn(id) === 0),
    flaky: ids.filter((id) => correctIn(id) > 0 && correctIn(id) < runs.length),
  };
}
export type GroupAgg = ReturnType<typeof aggregateGroup>;

/** What changed between two configurations, counting only changes that held in every run. */
export function compareGroups(before: GroupAgg, after: GroupAgg) {
  return {
    fixed: before.wrongEveryRun.filter((id) => after.correctEveryRun.includes(id)),
    regressed: before.correctEveryRun.filter((id) => !after.correctEveryRun.includes(id)),
  };
}

const p = (s: Spread) => (s.mean === null ? "n/a" : `${(s.mean * 100).toFixed(1)}% (${(s.min! * 100).toFixed(1)}-${(s.max! * 100).toFixed(1)})`);
const usd = (micro: number | null) => (micro === null ? "n/a" : `$${(micro / 1e6).toFixed(4)}`);
const list = (ids: string[]) => (ids.length ? ids.join(", ") : "none");

export function renderSummary(groups: Record<string, GroupAgg>): string {
  const names = Object.keys(groups);
  const row = (label: string, f: (g: GroupAgg) => string) => `| ${label} | ${names.map((n) => f(groups[n])).join(" | ")} |`;
  const lines = [
    "# Eval summary",
    "",
    "Accuracy is the mean over runs with the min-max range in brackets. Haiku's sampling cannot be pinned, so runs differ slightly even with identical code.",
    "",
    `| Measure | ${names.join(" | ")} |`,
    `|---|${names.map(() => "---").join("|")}|`,
    row("Runs", (g) => String(g.runs)),
    row("**Execution accuracy**", (g) => `**${p(g.overall)}**`),
    row("easy", (g) => p(g.easy)),
    row("medium", (g) => p(g.medium)),
    row("hard", (g) => p(g.hard)),
    row("development questions", (g) => p(g.dev)),
    row("held-out questions", (g) => p(g.holdout)),
    row("valid-SQL rate", (g) => p(g.validSql)),
    row("chart choice matched (of queries that ran)", (g) => p(g.chart)),
    row("suggest latency p50", (g) => (g.suggestP50 === null ? "n/a" : `${Math.round(g.suggestP50)} ms`)),
    row("cost per full run", (g) => usd(g.costPerRunMicro)),
    "",
    "## Which questions",
    "",
    ...names.flatMap((n) => [
      `**${n}**`,
      `- wrong in every run: ${list(groups[n].wrongEveryRun)}`,
      `- flaky (right in some runs): ${list(groups[n].flaky)}`,
      "",
    ]),
  ];
  for (let i = 1; i < names.length; i++) {
    const c = compareGroups(groups[names[0]], groups[names[i]]);
    lines.push(`**${names[0]} -> ${names[i]}**`, `- fixed in every run: ${list(c.fixed)}`, `- no longer right in every run: ${list(c.regressed)}`, "");
  }
  return lines.join("\n");
}

function main() {
  const prefixes = process.argv.slice(2);
  if (prefixes.length === 0) throw new Error("Usage: npm run eval:summary -- <prefix> [<prefix> ...]");
  const dir = path.resolve(process.cwd(), "evals", "results");
  const groups: Record<string, GroupAgg> = {};
  for (const prefix of prefixes) {
    const files = readdirSync(dir).filter((f) => f.startsWith(`${prefix}-run`) && f.endsWith(".json")).sort();
    if (files.length === 0) throw new Error(`No result files matching ${prefix}-run*.json`);
    groups[prefix] = aggregateGroup(files.map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")) as RunData));
  }
  const md = renderSummary(groups);
  writeFileSync(path.join(dir, "SUMMARY.md"), md + "\n");
  console.log(md);
}

if (require.main === module) main();
