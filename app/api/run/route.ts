import { z } from "zod";
import { guard } from "@/lib/limits/guard";
import { selectChart } from "@/lib/chart/select";
import { executeReadOnly, QueryError } from "@/lib/sql/execute";
import { MAX_SQL_LENGTH, validateReadOnlySql } from "@/lib/sql/validate";

/**
 * POST /api/run: validate the SQL (never trust the client, even if it came
 * from /api/suggest), run it read-only, and return rows for the UI.
 */

const bodySchema = z.object({ sql: z.string() });

function error(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

export async function POST(request: Request) {
  const limits = await guard(request, "run");
  if (!limits.ok) return limits.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return error(400, "bad_request", "The request body must be valid JSON.");
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return error(400, "bad_request", 'Expected a JSON body like {"sql": "SELECT ..."}.');
  }

  // Cheap length check first so we never parse megabytes of text.
  if (parsed.data.sql.length > MAX_SQL_LENGTH) {
    return error(400, "too_long", `The query is too long (limit ${MAX_SQL_LENGTH} characters).`);
  }

  const validation = await validateReadOnlySql(parsed.data.sql);
  if (!validation.ok) {
    console.log(JSON.stringify({ event: "run.blocked", code: validation.code }));
    return error(400, validation.code, validation.reason);
  }

  try {
    const result = await executeReadOnly(validation.sql);
    console.log(
      JSON.stringify({ event: "run.ok", rows: result.rows.length, truncated: result.truncated, durationMs: result.durationMs }),
    );
    return Response.json({
      columns: result.columns,
      rows: result.rows,
      rowCount: result.rows.length,
      truncated: result.truncated,
      durationMs: result.durationMs,
      chart: selectChart(result.columns, result.rows),
    });
  } catch (e) {
    if (e instanceof QueryError) {
      console.log(JSON.stringify({ event: "run.failed", code: e.code }));
      return e.code === "timeout" ? error(408, "timeout", e.message) : error(400, "database", e.message);
    }
    console.error("run.unexpected", e);
    return error(500, "internal", "Something went wrong running the query.");
  }
}
