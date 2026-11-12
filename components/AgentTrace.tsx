import { CheckIcon, CircleIcon, LoaderCircleIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { SuggestState } from "@/components/chat-types";
import { Trace, TraceDescription, TraceIcon, TraceLine, TraceTitle } from "@/components/ui/trace";

type Line = { key: string; status?: "running" | "error" | "pending"; icon: ReactNode; title: string; time?: string };

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

/**
 * The agent's steps, using only what really happens in /api/suggest: the model writes the query,
 * then the server checks it is a single read-only SELECT before returning it. Nothing is invented.
 * The time is measured in the browser around the whole request.
 */
function linesFor(suggest: Exclude<SuggestState, { status: "idle" }>): Line[] {
  const spin = <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" />;
  if (suggest.status === "loading") {
    return [
      { key: "write", status: "running", icon: spin, title: "Writing a read-only SQL query" },
      { key: "check", status: "pending", icon: <CircleIcon />, title: "Checking it is read-only" },
    ];
  }
  if (suggest.status === "done") {
    return [
      { key: "write", icon: <CheckIcon />, title: "Wrote a read-only SQL query" },
      { key: "check", icon: <CheckIcon />, title: "Checked that it only reads data", time: seconds(suggest.ms) },
    ];
  }
  if (suggest.code === "unsafe_sql") {
    // The model answered, but the server's read-only check rejected the query.
    return [
      { key: "write", icon: <CheckIcon />, title: "Wrote a SQL query" },
      { key: "check", status: "error", icon: <XIcon />, title: "Blocked: the query was not read-only", time: seconds(suggest.ms) },
    ];
  }
  return [{ key: "write", status: "error", icon: <XIcon />, title: "Couldn't write a query", time: seconds(suggest.ms) }];
}

export function AgentTrace({ suggest }: { suggest: Exclude<SuggestState, { status: "idle" }> }) {
  return (
    <Trace role="group" aria-label="What the agent did">
      {linesFor(suggest).map((l) => (
        // The pending line is told apart by its hollow icon, not by fading: the component's default 60%
        // opacity drops the text to 2.3:1 contrast in light mode (fails WCAG AA).
        <TraceLine key={l.key} status={l.status} className="data-[status=pending]:opacity-100!">
          <TraceIcon>{l.icon}</TraceIcon>
          <TraceTitle>{l.title}</TraceTitle>
          {/* Full-strength muted text: the component's default 70% opacity fails WCAG AA contrast. */}
          {l.time && <TraceDescription className="text-muted-foreground!">{l.time}</TraceDescription>}
        </TraceLine>
      ))}
    </Trace>
  );
}
