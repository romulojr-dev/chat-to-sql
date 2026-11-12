import type { ApiError } from "../api-types";

export type PostResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

/** Fallbacks for when the server (or a gateway in front of it) sends no usable JSON error. */
function fallback(status: number): { code: string; message: string } {
  switch (status) {
    case 429:
      return { code: "rate_limited", message: "Too many requests right now. Please wait a moment and try again." };
    case 503:
      return { code: "unavailable", message: "The service is temporarily unavailable. Please try again shortly." };
    case 408:
    case 504:
      return { code: "timeout", message: "That took too long and was stopped. Please try again." };
    default:
      return { code: "unknown", message: "Something went wrong. Please try again." };
  }
}

/**
 * POST JSON and return either the parsed success body or a user-presentable
 * error. Network failures and aborts are thrown for the caller to handle.
 */
export async function postJson<T>(url: string, body: unknown, signal: AbortSignal): Promise<PostResult<T>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  const json = (await res.json().catch(() => null)) as (T & Partial<ApiError>) | null;
  const apiError = json?.error;

  if (res.ok && json && !apiError) return { ok: true, data: json as T };
  if (apiError?.message) return { ok: false, code: apiError.code ?? "unknown", message: apiError.message };
  return { ok: false, ...fallback(res.status) };
}
