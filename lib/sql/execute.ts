import { Pool } from "@neondatabase/serverless";
import type { ValidatedSql } from "./validate";

/**
 * Layers 1, 2 and 4 of the safety design (see SPEC.md): runs SQL as the
 * read-only role, inside a READ ONLY transaction, with a statement timeout and
 * a row cap. Accepts only SQL that passed validateReadOnlySql.
 *
 * The user's SQL runs through a cursor, exactly as written, so the row cap
 * cannot be broken by trailing comments and no wrapper query is needed.
 * Fetching maxRows + 1 rows tells us whether the result was truncated.
 */

export const DEFAULT_MAX_ROWS = 1000;
export const DEFAULT_TIMEOUT_MS = 5000;

export type ExecuteResult = {
  columns: string[];
  rows: unknown[][];
  truncated: boolean;
  durationMs: number;
};

export type ExecuteOptions = {
  maxRows?: number;
  timeoutMs?: number;
  pool?: Pool;
};

export class QueryError extends Error {
  constructor(
    readonly code: "timeout" | "database",
    message: string,
  ) {
    super(message);
    this.name = "QueryError";
  }
}

let sharedPool: Pool | undefined;

function getPool(): Pool {
  if (!sharedPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set (see .env.example)");
    sharedPool = new Pool({ connectionString: url });
  }
  return sharedPool;
}

const QUERY_CANCELED = "57014"; // statement_timeout

export async function executeReadOnly(
  sql: ValidatedSql,
  { maxRows = DEFAULT_MAX_ROWS, timeoutMs = DEFAULT_TIMEOUT_MS, pool = getPool() }: ExecuteOptions = {},
): Promise<ExecuteResult> {
  if (!Number.isInteger(maxRows) || maxRows < 1) throw new Error("maxRows must be a positive integer");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) throw new Error("timeoutMs must be a positive integer");

  const client = await pool.connect();
  let discard = false;
  const started = performance.now();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query(`SET LOCAL statement_timeout = ${timeoutMs}`);
    await client.query(`DECLARE user_query NO SCROLL CURSOR FOR\n${sql}`);
    const res = await client.query({ text: `FETCH ${maxRows + 1} FROM user_query`, rowMode: "array" });
    await client.query("ROLLBACK");

    return {
      columns: res.fields.map((f) => f.name),
      rows: res.rows.slice(0, maxRows) as unknown[][],
      truncated: res.rows.length > maxRows,
      durationMs: Math.round(performance.now() - started),
    };
  } catch (e) {
    // The connection may be mid-transaction or otherwise in an unknown state:
    // never return it to the pool.
    discard = true;
    const err = e as { code?: string; message?: string };
    if (err.code === QUERY_CANCELED) {
      throw new QueryError("timeout", `The query took longer than ${timeoutMs / 1000}s and was stopped.`);
    }
    throw new QueryError("database", err.message ?? "The query failed to run.");
  } finally {
    client.release(discard);
  }
}
