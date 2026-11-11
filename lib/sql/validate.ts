import { loadModule, parse } from "libpg-query";
import { DATASET_TABLES } from "../schema/tables";

/**
 * Layer 3 of the safety design (see SPEC.md): parse the SQL with the real
 * Postgres parser and allow only a single read-only SELECT over dataset tables
 * using allowlisted functions. This is an allowlist, not a pattern match.
 * It is NOT the only protection: the DB role and READ ONLY transaction back it up.
 */

export const MAX_SQL_LENGTH = 5000;

export type ValidationCode =
  | "empty"
  | "too_long"
  | "syntax"
  | "multiple_statements"
  | "not_select"
  | "forbidden_construct"
  | "function_not_allowed"
  | "table_not_allowed";

/** SQL that passed validateReadOnlySql. The executor only accepts this type. */
export type ValidatedSql = string & { readonly __brand: "ValidatedSql" };

export type ValidationResult =
  | { ok: true; sql: ValidatedSql }
  | { ok: false; code: ValidationCode; reason: string };

const ALLOWED_FUNCTIONS = new Set([
  // aggregates
  "count", "sum", "avg", "min", "max", "stddev", "stddev_pop", "stddev_samp",
  "variance", "var_pop", "var_samp", "array_agg", "string_agg", "bool_and",
  "bool_or", "every", "percentile_cont", "percentile_disc", "mode", "corr",
  // window
  "row_number", "rank", "dense_rank", "percent_rank", "cume_dist", "ntile",
  "lag", "lead", "first_value", "last_value", "nth_value",
  // math
  "abs", "ceil", "ceiling", "floor", "round", "trunc", "sqrt", "power", "pow",
  "exp", "ln", "log", "log10", "mod", "sign",
  // strings
  "length", "char_length", "lower", "upper", "initcap", "trim", "ltrim", "rtrim",
  "btrim", "substr", "substring", "replace", "concat", "concat_ws", "left",
  "right", "position", "strpos", "split_part", "lpad", "rpad", "reverse",
  "starts_with",
  // dates
  "date_trunc", "date_part", "extract", "age", "now", "to_char", "to_date",
  "make_date", "timezone",
  // sets
  "generate_series",
]);

/** Only wall-clock SQL value functions; rejects current_user, session_user, etc. */
const ALLOWED_VALUE_FUNCTIONS = new Set([
  "SVFOP_CURRENT_DATE",
  "SVFOP_CURRENT_TIME",
  "SVFOP_CURRENT_TIME_N",
  "SVFOP_CURRENT_TIMESTAMP",
  "SVFOP_CURRENT_TIMESTAMP_N",
  "SVFOP_LOCALTIME",
  "SVFOP_LOCALTIME_N",
  "SVFOP_LOCALTIMESTAMP",
  "SVFOP_LOCALTIMESTAMP_N",
]);

const TABLES = new Set<string>(DATASET_TABLES);

class Reject extends Error {
  constructor(
    readonly code: ValidationCode,
    readonly reason: string,
  ) {
    super(reason);
  }
}

let moduleLoaded: Promise<void> | undefined;

type Node = Record<string, unknown>;
const isObject = (v: unknown): v is Node => typeof v === "object" && v !== null;

/** Collect every CTE name anywhere in the statement (they are valid table references). */
function collectCteNames(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) {
    node.forEach((n) => collectCteNames(n, out));
  } else if (isObject(node)) {
    for (const [key, value] of Object.entries(node)) {
      if (key === "CommonTableExpr" && isObject(value) && typeof value.ctename === "string") {
        out.add(value.ctename);
      }
      collectCteNames(value, out);
    }
  }
}

function funcName(funcname: unknown): { schema?: string; name: string } {
  const parts = (Array.isArray(funcname) ? funcname : [])
    .map((p) => (isObject(p) && isObject(p.String) ? String(p.String.sval) : ""))
    .filter(Boolean);
  return { schema: parts.length > 1 ? parts[parts.length - 2] : undefined, name: parts[parts.length - 1] ?? "" };
}

function walk(node: unknown, ctes: Set<string>): void {
  if (Array.isArray(node)) {
    for (const n of node) walk(n, ctes);
    return;
  }
  if (!isObject(node)) return;

  for (const [key, value] of Object.entries(node)) {
    // Any statement node other than SELECT (INSERT/UPDATE/DELETE/MERGE/...,
    // including ones hidden inside CTEs) is forbidden.
    if (/Stmt$/.test(key) && key !== "SelectStmt") {
      throw new Reject("not_select", "Only read-only SELECT queries are allowed.");
    }
    if (/^(Xml|Json)/.test(key) || key === "RangeTableFunc") {
      throw new Reject("forbidden_construct", "XML and JSON table constructs are not allowed.");
    }
    if (key === "ParamRef") {
      throw new Reject("forbidden_construct", "Query parameters are not supported.");
    }

    if (key === "SelectStmt" && isObject(value)) {
      if (value.intoClause) {
        throw new Reject("forbidden_construct", "SELECT INTO is not allowed because it creates a table.");
      }
      if (Array.isArray(value.lockingClause) && value.lockingClause.length > 0) {
        throw new Reject("forbidden_construct", "Row locking (FOR UPDATE / FOR SHARE) is not allowed.");
      }
    }

    if (key === "SQLValueFunction" && isObject(value)) {
      if (!ALLOWED_VALUE_FUNCTIONS.has(String(value.op))) {
        throw new Reject("function_not_allowed", "That built-in value (such as current_user) is not allowed.");
      }
    }

    if (key === "FuncCall" && isObject(value)) {
      const { schema, name } = funcName(value.funcname);
      const schemaOk = schema === undefined || schema === "pg_catalog";
      if (!schemaOk || !ALLOWED_FUNCTIONS.has(name.toLowerCase())) {
        throw new Reject("function_not_allowed", `The function "${name || "unknown"}" is not allowed.`);
      }
    }

    // Type references appear as a bare `typeName` field (e.g. inside TypeCast), not a wrapped node.
    if (key === "typeName" && isObject(value) && Array.isArray(value.names)) {
      const last = funcName(value.names).name.toLowerCase();
      if (last.startsWith("reg")) {
        throw new Reject("forbidden_construct", "Casting to system object types is not allowed.");
      }
    }

    if (key === "RangeVar" && isObject(value)) {
      const rel = String(value.relname);
      const schema = value.schemaname === undefined ? undefined : String(value.schemaname);
      const ok =
        value.catalogname === undefined &&
        ((schema === undefined && (TABLES.has(rel) || ctes.has(rel))) ||
          (schema === "public" && TABLES.has(rel)));
      if (!ok) {
        throw new Reject("table_not_allowed", `The table "${schema ? `${schema}.` : ""}${rel}" is not available.`);
      }
    }

    walk(value, ctes);
  }
}

export async function validateReadOnlySql(input: string): Promise<ValidationResult> {
  if (typeof input !== "string" || input.trim() === "") {
    return { ok: false, code: "empty", reason: "Please provide a SQL query." };
  }
  if (input.length > MAX_SQL_LENGTH) {
    return { ok: false, code: "too_long", reason: `The query is too long (limit ${MAX_SQL_LENGTH} characters).` };
  }

  try {
    moduleLoaded ??= loadModule();
    await moduleLoaded;

    let result;
    try {
      result = await parse(input);
    } catch {
      return { ok: false, code: "syntax", reason: "The query has a SQL syntax error." };
    }

    const stmts = result.stmts ?? [];
    if (stmts.length === 0) {
      return { ok: false, code: "empty", reason: "Please provide a SQL query." };
    }
    if (stmts.length > 1) {
      return { ok: false, code: "multiple_statements", reason: "Only one SQL statement is allowed at a time." };
    }

    const stmt = stmts[0].stmt as Node | undefined;
    if (!stmt || !isObject(stmt.SelectStmt)) {
      return { ok: false, code: "not_select", reason: "Only read-only SELECT queries are allowed." };
    }

    const ctes = new Set<string>();
    collectCteNames(stmt, ctes);
    walk(stmt, ctes);

    return { ok: true, sql: input.trim().replace(/[;\s]+$/, "") as ValidatedSql };
  } catch (e) {
    if (e instanceof Reject) return { ok: false, code: e.code, reason: e.reason };
    // Fail closed: anything unexpected is a rejection, never an allow.
    return { ok: false, code: "syntax", reason: "The query could not be checked and was blocked." };
  }
}
