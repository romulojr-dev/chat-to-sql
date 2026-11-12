"use client";

import { useEffect, useRef, useState } from "react";
import { ExampleQuestions } from "@/components/ExampleQuestions";
import { QuestionBox } from "@/components/QuestionBox";
import { ResultsView } from "@/components/ResultsView";
import { SqlPreview } from "@/components/SqlPreview";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import type { RunSuccess, SuggestSuccess } from "@/lib/api-types";
import { postJson } from "@/lib/client/post-json";

type SuggestState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; explanation: string }
  | { status: "error"; code: string; message: string };

type RunState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; result: RunSuccess }
  | { status: "error"; message: string };

/** True once `active` has stayed true for `ms` (used for "this is taking a while" hints). */
function useDelayedFlag(active: boolean, ms: number) {
  const [flag, setFlag] = useState(false);
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setFlag(true), ms);
    return () => {
      clearTimeout(t);
      setFlag(false);
    };
  }, [active, ms]);
  return active && flag;
}

// A suspended free-tier database takes a few seconds to wake on the first query.
const SLOW_RUN_HINT_MS = 2500;

export function Workbench() {
  const [question, setQuestion] = useState("");
  const [sql, setSql] = useState("");
  const [suggest, setSuggest] = useState<SuggestState>({ status: "idle" });
  const [run, setRun] = useState<RunState>({ status: "idle" });
  const suggestCtrl = useRef<AbortController | null>(null);
  const runCtrl = useRef<AbortController | null>(null);
  const slowRun = useDelayedFlag(run.status === "loading", SLOW_RUN_HINT_MS);

  async function onSuggest(override?: string) {
    const asked = override ?? question;
    if (override !== undefined) setQuestion(override);
    suggestCtrl.current?.abort();
    runCtrl.current?.abort();
    const ctrl = new AbortController();
    suggestCtrl.current = ctrl;
    setSuggest({ status: "loading" });
    setRun({ status: "idle" }); // a new question clears stale results
    setSql("");

    try {
      const r = await postJson<SuggestSuccess>("/api/suggest", { question: asked }, ctrl.signal);
      if (r.ok) {
        setSql(r.data.sql);
        setSuggest({ status: "done", explanation: r.data.explanation });
      } else {
        setSuggest({ status: "error", code: r.code, message: r.message });
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setSuggest({ status: "error", code: "network", message: "Could not reach the server. Please try again." });
    }
  }

  async function onRun() {
    runCtrl.current?.abort();
    const ctrl = new AbortController();
    runCtrl.current = ctrl;
    setRun({ status: "loading" });

    try {
      const r = await postJson<RunSuccess>("/api/run", { sql }, ctrl.signal);
      setRun(r.ok ? { status: "done", result: r.data } : { status: "error", message: r.message });
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setRun({ status: "error", message: "Could not reach the server. Please try again." });
    }
  }

  return (
    <div className="space-y-8">
      <QuestionBox question={question} onChange={setQuestion} onSubmit={() => onSuggest()} busy={suggest.status === "loading"} />
      <ExampleQuestions onPick={(q) => onSuggest(q)} disabled={suggest.status === "loading"} />

      <section aria-live="polite" aria-busy={suggest.status === "loading"} className="space-y-3">
        {suggest.status === "loading" && (
          <div className="space-y-2" role="status" aria-label="Writing a query">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-28 w-full" />
          </div>
        )}
        {suggest.status === "error" && (
          <Alert variant={suggest.code === "cannot_answer" ? "default" : "destructive"}>
            <AlertTitle>
              {suggest.code === "cannot_answer" ? "I can't answer that from this data" : "I couldn't suggest a query"}
            </AlertTitle>
            <AlertDescription>{suggest.message}</AlertDescription>
          </Alert>
        )}
      </section>

      {suggest.status === "done" && (
        <>
          <SqlPreview
            sql={sql}
            explanation={suggest.explanation}
            onChange={setSql}
            onRun={onRun}
            running={run.status === "loading"}
          />

          <section aria-live="polite" aria-busy={run.status === "loading"} className="space-y-3">
            {run.status === "loading" && (
              <div className="space-y-2" role="status" aria-label="Running query">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-40 w-full" />
                {slowRun && (
                  <p className="text-muted-foreground text-sm">
                    Waking up the database. The first query after a quiet period can take a few seconds.
                  </p>
                )}
              </div>
            )}
            {run.status === "error" && (
              <Alert variant="destructive">
                <AlertTitle>That query could not run</AlertTitle>
                <AlertDescription>{run.message}</AlertDescription>
              </Alert>
            )}
            {run.status === "done" && <ResultsView result={run.result} />}
          </section>
        </>
      )}
    </div>
  );
}
