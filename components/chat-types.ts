import type { RunSuccess } from "@/lib/api-types";

/** `ms` is the measured round trip of the request (model call plus the server-side read-only check). */
export type SuggestState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; explanation: string; ms: number }
  | { status: "error"; code: string; message: string; ms: number };

export type RunState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; result: RunSuccess }
  | { status: "error"; message: string };
