/**
 * Verifies the eval's ground truth: every reference query must pass the
 * validator, run against the database without error, return rows (untruncated),
 * and produce the chart type the question file says it should. For ranked top-N
 * questions it also checks that the answer is not ambiguous because of a tie at
 * the cutoff.
 *
 * Usage: npm run eval:check
 */
import { selectChart } from "../lib/chart/select";
import { executeReadOnly } from "../lib/sql/execute";
import { validateReadOnlySql } from "../lib/sql/validate";
import { QUESTIONS } from "./questions";

const show = (v: unknown) => (typeof v === "string" ? v.slice(0, 22) : JSON.stringify(v));

async function main() {
  let failures = 0;
  const fail = (id: string, msg: string) => {
    failures++;
    console.log(`  FAIL ${id}: ${msg}`);
  };

  for (const item of QUESTIONS) {
    const v = await validateReadOnlySql(item.sql);
    if (!v.ok) {
      fail(item.id, `validator rejected: ${v.reason}`);
      continue;
    }
    let result;
    try {
      result = await executeReadOnly(v.sql, { timeoutMs: 20_000 });
    } catch (e) {
      fail(item.id, `execution error: ${e instanceof Error ? e.message : e}`);
      continue;
    }

    const problems: string[] = [];
    if (result.rows.length === 0) problems.push("returned no rows");
    if (result.truncated) problems.push("result truncated at the row cap");
    const chart = selectChart(result.columns, result.rows)?.type ?? "none";
    if (chart !== item.expectedChart) problems.push(`chart is "${chart}" but expected "${item.expectedChart}"`);

    // Tie check: re-run a ranked top-N query with one extra row; the cutoff must not tie.
    const limit = /\bLIMIT (\d+)\s*$/i.exec(item.sql);
    if (item.ordered && limit) {
      const n = Number(limit[1]);
      const widerSql = await validateReadOnlySql(item.sql.replace(/\bLIMIT \d+\s*$/i, `LIMIT ${n + 1}`));
      const wider = widerSql.ok ? await executeReadOnly(widerSql.sql, { timeoutMs: 20_000 }).catch(() => null) : null;
      if (wider && wider.rows.length > n) {
        const last = wider.columns.length - 1;
        if (String(wider.rows[n - 1][last]) === String(wider.rows[n][last])) {
          problems.push(`tie at the top-${n} cutoff (${show(wider.rows[n - 1][last])})`);
        }
      }
    }

    const first = result.rows[0]?.map(show).join(" | ") ?? "";
    console.log(
      `${problems.length ? "  WARN" : "  ok  "} ${item.id} ${item.tier.padEnd(6)} ${String(result.rows.length).padStart(4)} rows ${String(result.durationMs).padStart(5)} ms  ${chart.padEnd(6)} ${first.slice(0, 70)}`,
    );
    for (const p of problems) fail(item.id, p);
  }

  console.log(`\n${QUESTIONS.length} questions checked, ${failures} problem(s).`);
  if (failures) process.exit(1);
}

main().then(() => process.exit(0));
