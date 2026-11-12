"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChatView } from "@/components/ChatView";
import type { RunState, SuggestState } from "@/components/chat-types";
import { ExampleQuestions } from "@/components/ExampleQuestions";
import { QuestionBox } from "@/components/QuestionBox";
import type { RunSuccess, SuggestSuccess } from "@/lib/api-types";
import { postJson } from "@/lib/client/post-json";

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

/**
 * Two views. Landing: a centered prompt box, examples, and the About section (`about`).
 * Chat: one question and its answer; no reply box, and "Back to homepage" returns to the landing view.
 */
export function Workbench({ about }: { about: ReactNode }) {
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState<string | null>(null); // null = landing view
  const [sql, setSql] = useState("");
  const [suggest, setSuggest] = useState<SuggestState>({ status: "idle" });
  const [run, setRun] = useState<RunState>({ status: "idle" });
  const suggestCtrl = useRef<AbortController | null>(null);
  const runCtrl = useRef<AbortController | null>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const focusPromptOnLanding = useRef(false);
  const slowRun = useDelayedFlag(run.status === "loading", SLOW_RUN_HINT_MS);

  // After "Back to homepage", put the cursor back in the prompt box once it has rendered.
  useEffect(() => {
    if (asked === null && focusPromptOnLanding.current) {
      focusPromptOnLanding.current = false;
      promptRef.current?.focus();
    }
  }, [asked]);

  async function onSuggest(override?: string) {
    const text = override ?? question;
    suggestCtrl.current?.abort();
    runCtrl.current?.abort();
    const ctrl = new AbortController();
    suggestCtrl.current = ctrl;
    setAsked(text);
    setSuggest({ status: "loading" });
    setRun({ status: "idle" });
    setSql("");
    const started = performance.now();

    try {
      const r = await postJson<SuggestSuccess>("/api/suggest", { question: text }, ctrl.signal);
      const ms = Math.round(performance.now() - started);
      if (r.ok) {
        setSql(r.data.sql);
        setSuggest({ status: "done", explanation: r.data.explanation, ms });
      } else {
        setSuggest({ status: "error", code: r.code, message: r.message, ms });
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setSuggest({
        status: "error",
        code: "network",
        message: "Could not reach the server. Please try again.",
        ms: Math.round(performance.now() - started),
      });
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

  /** Cancel anything in flight, so a late answer can't appear on the landing view, and start fresh. */
  function onHome() {
    suggestCtrl.current?.abort();
    runCtrl.current?.abort();
    focusPromptOnLanding.current = true;
    setQuestion("");
    setSql("");
    setSuggest({ status: "idle" });
    setRun({ status: "idle" });
    setAsked(null);
  }

  return (
    <main className="flex flex-1 flex-col">
      {asked === null || suggest.status === "idle" ? (
        <>
          <section className="mx-auto flex min-h-[calc(100svh-3.1rem-12rem)] w-full max-w-3xl flex-col items-center justify-center gap-6 px-4 py-10">
            <h2 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">
              What do you want to analyze?
            </h2>
            <QuestionBox question={question} onChange={setQuestion} onSubmit={() => onSuggest()} inputRef={promptRef} />
            <ExampleQuestions onPick={(q) => onSuggest(q)} />
          </section>
          {about}
        </>
      ) : (
        <ChatView
          question={asked}
          suggest={suggest}
          sql={sql}
          onSqlChange={setSql}
          onRun={onRun}
          run={run}
          slowRun={slowRun}
          onHome={onHome}
        />
      )}
    </main>
  );
}
