"use client";

import { useRef, useState } from "react";
import { ResultsTable } from "@/components/ResultsTable";
import { SqlPreview } from "@/components/SqlPreview";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import type { ApiError, RunSuccess } from "@/lib/api-types";

const SAMPLE_SQL = `SELECT order_status, count(*) AS orders
FROM orders
GROUP BY 1
ORDER BY 2 DESC`;

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; result: RunSuccess }
  | { status: "error"; message: string };

export function Workbench() {
  const [sql, setSql] = useState(SAMPLE_SQL);
  const [state, setState] = useState<State>({ status: "idle" });
  const controller = useRef<AbortController | null>(null);

  async function run() {
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    setState({ status: "loading" });

    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sql }),
        signal: ctrl.signal,
      });
      const body = (await res.json()) as RunSuccess | ApiError;
      if (!res.ok || "error" in body) {
        setState({ status: "error", message: "error" in body ? body.error.message : "The query failed." });
      } else {
        setState({ status: "done", result: body });
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setState({ status: "error", message: "Could not reach the server. Please try again." });
    }
  }

  return (
    <div className="space-y-8">
      <SqlPreview sql={sql} onChange={setSql} onRun={run} running={state.status === "loading"} />

      <section aria-live="polite" aria-busy={state.status === "loading"} className="space-y-3">
        {state.status === "loading" && (
          <div className="space-y-2" role="status" aria-label="Running query">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}
        {state.status === "error" && (
          <Alert variant="destructive">
            <AlertTitle>That query could not run</AlertTitle>
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        )}
        {state.status === "done" && <ResultsTable result={state.result} />}
      </section>
    </div>
  );
}
