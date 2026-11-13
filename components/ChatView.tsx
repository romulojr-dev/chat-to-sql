"use client";

import Image from "next/image";
import { HomeIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { AgentTrace } from "@/components/AgentTrace";
import type { RunState, SuggestState } from "@/components/chat-types";
import { ResultsView } from "@/components/ResultsView";
import { SqlPreview } from "@/components/SqlPreview";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type Props = {
  /** The question that was sent. It is shown as the user's message and cannot be replied to. */
  question: string;
  suggest: Exclude<SuggestState, { status: "idle" }>;
  sql: string;
  onSqlChange: (sql: string) => void;
  onRun: () => void;
  run: RunState;
  slowRun: boolean;
  onHome: () => void;
};

/** One question, one answer: the user's message, then the agent's Trace, SQL, results and a way home. */
export function ChatView({ question, suggest, sql, onSqlChange, onRun, run, slowRun, onHome }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  // Keep the newest content in view as the agent works.
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    endRef.current?.scrollIntoView({ block: "end", behavior: reduce ? "auto" : "smooth" });
  }, [suggest.status, run.status]);

  const finished = suggest.status === "error" || run.status === "done" || run.status === "error";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:py-10">
      <div className="bg-primary text-primary-foreground ml-auto max-w-[85%] rounded-2xl rounded-br-sm px-4 py-2.5 text-sm break-words">
        {question}
      </div>

      <div className="flex gap-3">
        {/* Pixel-art dino on a primary-colored circle. The dino is the inverse of the circle: white on black in light
            mode, dark on light in dark mode. It follows the theme toggle (the "auto" file follows only the OS setting). */}
        <div aria-hidden="true" className="bg-primary flex size-9 shrink-0 items-center justify-center rounded-full">
          <Image
            src="/dino/dino-dark.svg"
            alt=""
            width={20}
            height={18}
            unoptimized
            className="h-[18px] w-5 dark:hidden"
            style={{ imageRendering: "pixelated" }}
          />
          <Image
            src="/dino/dino-light.svg"
            alt=""
            width={20}
            height={18}
            unoptimized
            className="hidden h-[18px] w-5 dark:block"
            style={{ imageRendering: "pixelated" }}
          />
        </div>

        <div className="min-w-0 flex-1 space-y-4">
          <p className="text-muted-foreground text-xs font-semibold">SiyasatQL</p>

          <section aria-live="polite" aria-busy={suggest.status === "loading"} className="space-y-3">
            <AgentTrace suggest={suggest} />
            {suggest.status === "error" && suggest.code !== "unsafe_sql" && (
              <Alert variant={suggest.code === "cannot_answer" ? "default" : "destructive"}>
                <AlertTitle>
                  {suggest.code === "cannot_answer" ? "I can't answer that from this data" : "I couldn't suggest a query"}
                </AlertTitle>
                <AlertDescription>{suggest.message}</AlertDescription>
              </Alert>
            )}
            {suggest.status === "error" && suggest.code === "unsafe_sql" && (
              <Alert variant="destructive">
                <AlertTitle>I couldn&apos;t suggest a safe query</AlertTitle>
                <AlertDescription>{suggest.message}</AlertDescription>
              </Alert>
            )}
          </section>

          {suggest.status === "done" && (
            <>
              <SqlPreview
                sql={sql}
                explanation={suggest.explanation}
                onChange={onSqlChange}
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

          {finished && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed p-3">
              <p className="text-muted-foreground min-w-56 flex-1 text-sm">
                {run.status === "done"
                  ? "That's the answer to this question. SiyasatQL can't take replies or follow-ups, so to ask something new, head back to the homepage."
                  : "SiyasatQL can't take replies or follow-ups, so to try another question, head back to the homepage."}
              </p>
              <Button variant="outline" onClick={onHome}>
                <HomeIcon data-icon="inline-start" />
                Back to homepage
              </Button>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>
    </div>
  );
}
