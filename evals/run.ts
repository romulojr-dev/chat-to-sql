/**
 * Eval harness. Runs the app's real code path for every eval question:
 *   suggestSql (the model) -> validateReadOnlySql -> executeReadOnly (5 s timeout,
 *   1000-row cap) -> compare with the reference result, then scores safety on the
 *   negative prompts. Writes a JSON and a Markdown report to evals/results/.
 *
 * This CALLS THE LLM AND COSTS A LITTLE MONEY (roughly $0.02 on Haiku for a full run).
 *
 * Usage:
 *   npm run eval -- --label baseline
 *   npm run eval -- --split holdout --model claude-sonnet-5-5 --label sonnet-holdout
 *   npm run eval -- --ids e01,m02,h03 --no-negatives        (quick smoke run)
 * Flags: --model, --effort low|medium|high|xhigh|max, --split all|dev|holdout,
 *        --ids a,b,c, --limit N, --label name, --concurrency N (default 1: honest latency),
 *        --no-negatives
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { selectChart } from "../lib/chart/select";
import { costMicroUsd } from "../lib/limits/cost";
import { buildSystemPrompt } from "../lib/llm/prompt";
import { resolveModel, suggestSql, type Effort } from "../lib/llm/suggest";
import { executeReadOnly, QueryError } from "../lib/sql/execute";
import { validateReadOnlySql } from "../lib/sql/validate";
import { compareTables, type Table } from "./compare";
import { NEGATIVES } from "./negatives";
import { QUESTIONS, type EvalQuestion } from "./questions";
import { renderMarkdown } from "./render";
import { summarize, type NegativeRecord, type QuestionRecord } from "./report";

function parseArgs(argv: string[]) {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

async function pool<T, R>(items: T[], concurrency: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

const present = (name: string) => (process.env[name] ?? "").replace(/\r/g, "").trim() !== "";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  for (const name of ["ANTHROPIC_API_KEY", "DATABASE_URL"]) {
    if (!present(name)) throw new Error(`${name} is not set (see .env.example)`);
  }

  const model = resolveModel(typeof args.model === "string" ? args.model : undefined);
  const effort = typeof args.effort === "string" ? (args.effort as Effort) : undefined;
  const split = typeof args.split === "string" ? args.split : "all";
  const concurrency = typeof args.concurrency === "string" ? Number(args.concurrency) || 1 : 1;

  let selected: EvalQuestion[] = QUESTIONS.filter((q) => split === "all" || q.split === split);
  if (typeof args.ids === "string") {
    const ids = new Set(args.ids.split(","));
    selected = QUESTIONS.filter((q) => ids.has(q.id));
  }
  if (typeof args.limit === "string") selected = selected.slice(0, Number(args.limit));
  if (selected.length === 0) throw new Error("No questions selected");
  const runNegatives = args["no-negatives"] !== true;

  const date = new Date().toISOString().slice(0, 10);
  const label = typeof args.label === "string" ? args.label : `${date}-${model}-${split}${effort ? `-${effort}` : ""}`;
  console.log(`Eval "${label}": ${selected.length} questions${runNegatives ? ` + ${NEGATIVES.length} safety prompts` : ""} on ${model}${effort ? ` (effort ${effort})` : ""}`);

  // 1. Ground truth: run every reference query once.
  const reference = new Map<string, Table>();
  for (const item of selected) {
    const v = await validateReadOnlySql(item.sql);
    if (!v.ok) throw new Error(`Reference ${item.id} fails validation: ${v.reason}`);
    const r = await executeReadOnly(v.sql, { timeoutMs: 20_000 });
    reference.set(item.id, { columns: r.columns, rows: r.rows });
  }

  const ordersCount = async () => {
    const v = await validateReadOnlySql("SELECT count(*) FROM orders");
    if (!v.ok) throw new Error("integrity query rejected");
    return Number((await executeReadOnly(v.sql)).rows[0][0]);
  };
  const ordersBefore = await ordersCount();

  // 2. Answerable questions.
  const records = await pool(selected, concurrency, async (item, i): Promise<QuestionRecord> => {
    const base = { id: item.id, tier: item.tier, split: item.split, question: item.question, expectedChart: item.expectedChart };
    const started = performance.now();
    const sug = await suggestSql(item.question, { model, effort });
    const suggestMs = Math.round(performance.now() - started);
    const usage = sug.usage ?? { inputTokens: 0, outputTokens: 0 };
    const common = {
      ...base,
      suggestMs,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costMicro: sug.usage ? costMicroUsd(sug.ok ? sug.model : model, sug.usage) : 0,
    };

    let rec: QuestionRecord;
    if (!sug.ok) {
      const declined = sug.code === "cannot_answer" || sug.code === "refused";
      rec = { ...common, outcome: declined ? "declined" : "suggest_error", reason: `${sug.code}: ${sug.reason}` };
    } else {
      const v = await validateReadOnlySql(sug.sql);
      if (!v.ok) {
        rec = { ...common, outcome: "blocked", sql: sug.sql, reason: `${v.code}: ${v.reason}` };
      } else {
        try {
          const result = await executeReadOnly(v.sql); // the app's own timeout and row cap
          const chart = selectChart(result.columns, result.rows)?.type ?? "none";
          const ref = reference.get(item.id)!;
          const cmp = result.truncated
            ? { match: false, reason: "result truncated at the row cap" }
            : compareTables(ref, { columns: result.columns, rows: result.rows }, item.ordered);
          rec = { ...common, outcome: cmp.match ? "correct" : "wrong", sql: v.sql, reason: cmp.reason, runMs: result.durationMs, chart };
        } catch (e) {
          if (!(e instanceof QueryError)) throw e;
          rec = { ...common, outcome: "exec_error", sql: v.sql, reason: `${e.code}: ${e.message}` };
        }
      }
    }
    console.log(`  [${String(i + 1).padStart(2)}/${selected.length}] ${item.id} ${rec.outcome.padEnd(13)} ${suggestMs} ms`);
    return rec;
  });

  // 3. Safety prompts: nothing is executed; we record which layer stopped each.
  const negatives: NegativeRecord[] = [];
  if (runNegatives) {
    for (const item of NEGATIVES) {
      const sug = await suggestSql(item.prompt, { model, effort });
      const usage = sug.usage;
      const cost = {
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
        costMicro: usage ? costMicroUsd(sug.ok ? sug.model : model, usage) : 0,
      };
      const base = { id: item.id, kind: item.kind, prompt: item.prompt, ...cost };
      if (!sug.ok) {
        const declined = sug.code === "cannot_answer" || sug.code === "refused";
        negatives.push({ ...base, outcome: declined ? "declined" : "suggest_error", reason: `${sug.code}: ${sug.reason}` });
      } else {
        const v = await validateReadOnlySql(sug.sql);
        negatives.push({ ...base, outcome: v.ok ? "benign_select" : "blocked_by_validator", sql: sug.sql, reason: v.ok ? undefined : `${v.code}` });
      }
      console.log(`  [safety] ${item.id} ${negatives[negatives.length - 1].outcome}`);
    }
  }

  // 4. Integrity: nothing the eval did may have changed the data.
  const ordersAfter = await ordersCount();
  if (ordersAfter !== ordersBefore) throw new Error(`INTEGRITY FAILURE: orders went from ${ordersBefore} to ${ordersAfter}`);

  const summary = summarize(records, negatives);
  const meta = {
    label,
    date,
    model,
    effort: effort ?? "model default",
    split: typeof args.ids === "string" ? `ids: ${args.ids}` : split,
    gitCommit: (() => {
      try {
        return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
      } catch {
        return "unknown";
      }
    })(),
    promptSha: createHash("sha256").update(buildSystemPrompt()).digest("hex").slice(0, 12),
    questionCount: selected.length,
    negativeCount: negatives.length,
  };

  const dir = path.resolve(process.cwd(), "evals", "results");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${label}.json`), JSON.stringify({ meta, summary, records, negatives }, null, 2) + "\n");
  writeFileSync(path.join(dir, `${label}.md`), renderMarkdown(meta, summary, records, negatives));

  const a = summary.accuracy;
  console.log(`\nExecution accuracy: ${a.overall.correct}/${a.overall.total}` + ` (easy ${a.byTier.easy.correct}/${a.byTier.easy.total}, medium ${a.byTier.medium.correct}/${a.byTier.medium.total}, hard ${a.byTier.hard.correct}/${a.byTier.hard.total})`);
  console.log(`Held-out: ${a.bySplit.holdout.correct}/${a.bySplit.holdout.total}; valid SQL ${summary.validSql.valid}/${summary.validSql.total}`);
  console.log(`Cost of this run: $${(summary.cost.totalMicro / 1e6).toFixed(5)}. Report: evals/results/${label}.md`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error("Eval failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
