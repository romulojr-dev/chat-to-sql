/**
 * Deterministic chart selection from a result's shape (see SPEC.md "Chart
 * Selection"). Pure and UI-free so it is unit-testable and the eval harness
 * can score chart choice. Returns null when a table is the better answer.
 *
 * Values arrive straight from the database driver: numeric/bigint columns are
 * strings, and timestamp/date columns are raw strings (see execute.ts).
 */

export type BarLineSpec = {
  type: "bar" | "line";
  xLabel: string;
  yLabel: string;
  data: { x: string; y: number | null }[];
};
export type NumberSpec = { type: "number"; label: string; value: number };
export type ChartSpec = BarLineSpec | NumberSpec;

export const MAX_BAR_CATEGORIES = 20;

type Kind = "numeric" | "temporal" | "categorical" | "empty";

// Plain decimals only. Leading zeros ("01037") are identifiers, not numbers.
const NUMERIC = /^-?(0|[1-9]\d*)(\.\d+)?$/;
const TEMPORAL = /^\d{4}-\d{2}(-\d{2}([ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)?)?)?$/;
const MIDNIGHT = /^(\d{4}-\d{2}-\d{2})[ T]00:00:00(\.0+)?Z?$/;

const isNumeric = (v: unknown) =>
  (typeof v === "number" && Number.isFinite(v)) || (typeof v === "string" && NUMERIC.test(v));
const isTemporal = (v: unknown) => typeof v === "string" && TEMPORAL.test(v);

function classify(values: unknown[]): Kind {
  const present = values.filter((v) => v !== null && v !== undefined);
  if (present.length === 0) return "empty";
  if (present.every(isNumeric)) return "numeric";
  if (present.every(isTemporal)) return "temporal";
  return "categorical";
}

const toNumber = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const toLabel = (v: unknown): string => (v === null || v === undefined ? "(null)" : String(v));
const dayOnlyIfMidnight = (s: string) => s.replace(MIDNIGHT, "$1");

export function selectChart(columns: string[], rows: unknown[][]): ChartSpec | null {
  if (rows.length === 0) return null;

  if (columns.length === 1) {
    const value = rows[0][0];
    if (rows.length === 1 && isNumeric(value)) {
      return { type: "number", label: columns[0], value: Number(value) };
    }
    return null;
  }

  if (columns.length !== 2 || rows.length < 2) return null;

  const kinds = [classify(rows.map((r) => r[0])), classify(rows.map((r) => r[1]))];

  // Decide which column is the measure (y) and which is the dimension (x).
  let measure: 0 | 1;
  if (kinds[1] === "numeric") measure = 1; // also covers numeric + numeric: first is the label
  else if (kinds[0] === "numeric") measure = 0;
  else return null;
  const dim = measure === 0 ? 1 : 0;

  const dimKind: Kind = kinds[dim] === "numeric" ? "categorical" : kinds[dim];
  if (dimKind === "empty") return null;

  const points = rows.map((r) => ({
    x: toLabel(r[dim]),
    y: toNumber(r[measure]),
  }));
  const base = { xLabel: columns[dim], yLabel: columns[measure] };

  if (dimKind === "temporal") {
    const data = points
      .map((p) => ({ ...p, x: dayOnlyIfMidnight(p.x) }))
      .sort((a, b) => (a.x < b.x ? -1 : a.x > b.x ? 1 : 0));
    return { type: "line", ...base, data };
  }

  if (points.length > MAX_BAR_CATEGORIES) return null;
  return { type: "bar", ...base, data: points };
}
