import { z } from "zod";
import { guard } from "@/lib/limits/guard";
import { resolveModel, suggestSql } from "@/lib/llm/suggest";
import { validateReadOnlySql } from "@/lib/sql/validate";

/**
 * POST /api/suggest: question in, validated SQL + explanation out.
 * The SQL is validated before it is returned, so unsafe SQL never reaches the
 * client; /api/run re-validates anyway because the user can edit it.
 */

const bodySchema = z.object({ question: z.string() });

function error(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

export async function POST(request: Request) {
  // Rate limit and reserve budget BEFORE doing anything that could cost money.
  const model = resolveModel();
  const limits = await guard(request, "suggest", model);
  if (!limits.ok) return limits.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    await limits.settle({ model }); // nothing was spent: release the reservation
    return error(400, "bad_request", "The request body must be valid JSON.");
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    await limits.settle({ model });
    return error(400, "bad_request", 'Expected a JSON body like {"question": "..."}.');
  }

  const started = Date.now();
  let result;
  try {
    result = await suggestSql(parsed.data.question);
  } catch (e) {
    // suggestSql turns every API failure into a typed result, so a throw means a bug or a
    // misconfiguration (e.g. no API key) before any billable call. Release the reservation,
    // otherwise every failing request would leak budget. The Anthropic console limit is the backstop.
    await limits.settle({ model });
    console.error("suggest.unexpected", e);
    return error(500, "internal", "Something went wrong. Please try again.");
  }

  // Charge what the call really cost (a call that never reached the API has no usage and costs nothing).
  await limits.settle({ model: result.ok ? result.model : model, usage: result.usage });

  if (!result.ok) {
    console.log(JSON.stringify({ event: "suggest.failed", code: result.code, ...result.usage }));
    const status = result.code === "invalid_question" ? 400 : result.code === "unavailable" ? 503 : 422;
    return error(status, result.code, result.reason);
  }

  const validation = await validateReadOnlySql(result.sql);
  if (!validation.ok) {
    // Log the model's SQL server-side for debugging; never send it to the client.
    console.log(
      JSON.stringify({
        event: "suggest.unsafe_sql",
        validation: validation.code,
        question: parsed.data.question.slice(0, 200),
        sql: result.sql.slice(0, 500),
      }),
    );
    return error(422, "unsafe_sql", "The assistant suggested a query that isn't allowed. Please try rephrasing your question.");
  }

  console.log(
    JSON.stringify({
      event: "suggest.ok",
      question: parsed.data.question.slice(0, 200),
      sql: validation.sql.slice(0, 500),
      model: result.model,
      latencyMs: Date.now() - started,
      ...result.usage,
    }),
  );
  return Response.json({ sql: validation.sql, explanation: result.explanation, usage: result.usage });
}
