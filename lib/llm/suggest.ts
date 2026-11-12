import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { buildSystemPrompt, MAX_QUESTION_LENGTH, type PromptVersion } from "./prompt";

/**
 * Turns a plain-English question into suggested SQL with Claude. UI-free, so
 * the eval harness can call it directly. It does NOT validate or run the SQL:
 * callers must pass the result through validateReadOnlySql.
 */

/** Cheapest current model; override with ANTHROPIC_MODEL or the `model` option. */
export const DEFAULT_MODEL = "claude-haiku-5-5";

// Adaptive thinking is on by default for this model and thinking tokens count
// against max_tokens, so leave generous room for a short SQL answer.
const MAX_OUTPUT_TOKENS = 8000;

const outputSchema = z.object({
  answerable: z.boolean(),
  sql: z.string(),
  explanation: z.string(),
});

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export type SuggestOptions = {
  client?: Anthropic;
  model?: string;
  effort?: Effort;
  /** Defaults to the current production prompt; the eval pins older versions. */
  promptVersion?: PromptVersion;
};

export type SuggestUsage = { inputTokens: number; outputTokens: number };

export type SuggestResult =
  | { ok: true; sql: string; explanation: string; model: string; usage: SuggestUsage }
  | {
      ok: false;
      code: "invalid_question" | "cannot_answer" | "refused" | "invalid_output" | "unavailable";
      reason: string;
      usage?: SuggestUsage;
    };

/** The model a request will use: explicit option, then ANTHROPIC_MODEL, then the default. */
export const resolveModel = (override?: string) => override ?? (process.env.ANTHROPIC_MODEL || DEFAULT_MODEL);

let sharedClient: Anthropic | undefined;
const getClient = () => (sharedClient ??= new Anthropic());

export async function suggestSql(question: string, options: SuggestOptions = {}): Promise<SuggestResult> {
  const trimmed = typeof question === "string" ? question.trim() : "";
  if (trimmed === "") {
    return { ok: false, code: "invalid_question", reason: "Please type a question." };
  }
  if (trimmed.length > MAX_QUESTION_LENGTH) {
    return {
      ok: false,
      code: "invalid_question",
      reason: `Please keep your question under ${MAX_QUESTION_LENGTH} characters.`,
    };
  }

  const model = resolveModel(options.model);

  let response;
  try {
    response = await (options.client ?? getClient()).messages.parse({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: buildSystemPrompt(options.promptVersion),
      messages: [{ role: "user", content: trimmed }],
      output_config: {
        format: zodOutputFormat(outputSchema),
        ...(options.effort ? { effort: options.effort } : {}),
      },
    });
  } catch (e) {
    // Network, rate-limit, auth and server errors: tell the user it's
    // temporarily unavailable, log the real cause server-side only.
    if (e instanceof Anthropic.APIError || e instanceof Anthropic.APIConnectionError) {
      console.error("llm.suggest.api_error", { status: (e as { status?: number }).status, name: e.constructor.name });
      return { ok: false, code: "unavailable", reason: "The assistant is temporarily unavailable. Please try again shortly." };
    }
    throw e; // programming errors should surface, not be hidden
  }

  const usage: SuggestUsage = {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };

  if (response.stop_reason === "refusal") {
    return { ok: false, code: "refused", reason: "The assistant couldn't help with that question.", usage };
  }
  if (response.stop_reason === "max_tokens" || !response.parsed_output) {
    return { ok: false, code: "invalid_output", reason: "The assistant's answer was incomplete. Please try rephrasing.", usage };
  }

  const { answerable, sql, explanation } = response.parsed_output;
  if (!answerable) {
    return { ok: false, code: "cannot_answer", reason: explanation.trim() || "That question can't be answered from this data.", usage };
  }
  if (sql.trim() === "") {
    return { ok: false, code: "invalid_output", reason: "The assistant didn't produce a query. Please try rephrasing.", usage };
  }

  return { ok: true, sql: sql.trim(), explanation: explanation.trim(), model: response.model, usage };
}
