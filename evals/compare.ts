/**
 * Decides whether the model's query result "means the same" as the reference
 * result. This defines what execution accuracy counts as correct, so the rules
 * are deliberately explicit and unit-tested (tests/compare.test.ts):
 *
 *  - Column names and column order are ignored; extra columns are allowed.
 *  - Row order is ignored unless the question is a ranking / time series.
 *  - Numbers compare within rounding error only: to one decimal below 100, to a
 *    whole number from 100 up. A different magnitude (0.97 vs 97) or a different
 *    count (96000 vs 96478) is wrong.
 *  - Dates compare by day across formats; text compares case-insensitively.
 */

export type Table = { columns: string[]; rows: unknown[][] };
export type Cell = null | number | string;

const NUMERIC = /^-?(0|[1-9]\d*)(\.\d+)?$/; // leading zeros (zip codes, ids) stay text
const YEAR_MONTH = /^\d{4}-\d{2}$/;
const MIDNIGHT = /^(\d{4}-\d{2}-\d{2})[ T]00:00:00(\.0+)?Z?$/;

export function normalizeCell(v: unknown): Cell {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "string") {
    const s = v.trim();
    if (NUMERIC.test(s)) return Number(s);
    if (YEAR_MONTH.test(s)) return `${s}-01`;
    const midnight = MIDNIGHT.exec(s);
    if (midnight) return midnight[1];
    return s.toLowerCase();
  }
  return JSON.stringify(v);
}

/** Largest difference that can be explained by rounding the answer for display. */
function tolerance(a: number, b: number): number {
  return Math.max(Math.abs(a), Math.abs(b)) >= 100 ? 0.5 : 0.05;
}

function cellsMatch(a: Cell, b: Cell): boolean {
  if (a === null || b === null) return a === b;
  if (typeof a === "number" && typeof b === "number") {
    return Math.abs(a - b) <= tolerance(a, b) + 1e-9;
  }
  return a === b;
}

/**
 * Do two lists of single cells hold the same values, ignoring order?
 * Nulls and text compare by exact counts. Numbers are paired in sorted order:
 * with a fixed tolerance band that finds a valid pairing whenever one exists.
 * (A greedy "first match" can strand a value that another one needed.)
 */
function sameMultiset(a: Cell[], b: Cell[]): boolean {
  if (a.length !== b.length) return false;

  const split = (cells: Cell[]) => {
    const text = new Map<string, number>();
    const numbers: number[] = [];
    let nulls = 0;
    for (const c of cells) {
      if (c === null) nulls++;
      else if (typeof c === "number") numbers.push(c);
      else text.set(c, (text.get(c) ?? 0) + 1);
    }
    return { text, numbers: numbers.sort((x, y) => x - y), nulls };
  };

  const x = split(a);
  const y = split(b);
  if (x.nulls !== y.nulls || x.numbers.length !== y.numbers.length || x.text.size !== y.text.size) return false;
  for (const [k, n] of x.text) if (y.text.get(k) !== n) return false;
  return x.numbers.every((v, i) => cellsMatch(v, y.numbers[i]));
}

const MAX_ACTUAL_COLUMNS = 8;

export function compareTables(expected: Table, actual: Table, ordered: boolean): { match: boolean; reason?: string } {
  if (actual.rows.length !== expected.rows.length) {
    return { match: false, reason: `row count ${actual.rows.length}, expected ${expected.rows.length}` };
  }
  const k = expected.columns.length;
  if (actual.columns.length < k) {
    return { match: false, reason: `${actual.columns.length} column(s), expected at least ${k}` };
  }
  if (actual.columns.length > MAX_ACTUAL_COLUMNS) {
    return { match: false, reason: `too many columns (${actual.columns.length}) to compare` };
  }

  const exp = expected.rows.map((r) => r.map(normalizeCell));
  const act = actual.rows.map((r) => r.map(normalizeCell));
  const colOf = (rows: Cell[][], j: number) => rows.map((r) => r[j]);

  // For each expected column, which actual columns hold the same values (as a multiset)?
  const candidates: number[][] = [];
  for (let j = 0; j < k; j++) {
    const want = colOf(exp, j);
    const found: number[] = [];
    for (let i = 0; i < actual.columns.length; i++) {
      if (sameMultiset(want, colOf(act, i))) found.push(i);
    }
    if (found.length === 0) return { match: false, reason: `no column matches expected column ${j + 1} (${expected.columns[j]})` };
    candidates.push(found);
  }

  const rowsMatch = (mapping: number[]): boolean => {
    if (ordered) {
      return exp.every((er, r) => mapping.every((ai, j) => cellsMatch(er[j], act[r][ai])));
    }
    // Exact bipartite matching (augmenting paths), not "first match": see sameMultiset.
    const fits = (er: Cell[], ar: Cell[]) => mapping.every((ai, j) => cellsMatch(er[j], ar[ai]));
    const matchedTo = new Array<number>(act.length).fill(-1); // actual row -> expected row
    const augment = (e: number, seen: boolean[]): boolean => {
      for (let r = 0; r < act.length; r++) {
        if (seen[r] || !fits(exp[e], act[r])) continue;
        seen[r] = true;
        if (matchedTo[r] === -1 || augment(matchedTo[r], seen)) {
          matchedTo[r] = e;
          return true;
        }
      }
      return false;
    };
    return exp.every((_, e) => augment(e, new Array<boolean>(act.length).fill(false)));
  };

  // Try each assignment of distinct actual columns to the expected columns.
  const mapping: number[] = [];
  const search = (j: number): boolean => {
    if (j === k) return rowsMatch(mapping);
    for (const i of candidates[j]) {
      if (mapping.includes(i)) continue;
      mapping.push(i);
      if (search(j + 1)) return true;
      mapping.pop();
    }
    return false;
  };

  return search(0)
    ? { match: true }
    : { match: false, reason: ordered ? "values or their order differ" : "values differ" };
}
