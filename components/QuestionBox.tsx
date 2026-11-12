import { ArrowUpIcon } from "lucide-react";
import type { Ref } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MAX_QUESTION_LENGTH } from "@/lib/llm/prompt";

type Props = {
  question: string;
  onChange: (question: string) => void;
  onSubmit: () => void;
  inputRef?: Ref<HTMLTextAreaElement>;
};

/** The big prompt box on the landing view. There is no equivalent in the chat view: one question per chat. */
export function QuestionBox({ question, onChange, onSubmit, inputRef }: Props) {
  const canSubmit = question.trim().length > 0;

  return (
    <form
      className="bg-card focus-within:border-ring focus-within:ring-ring/30 flex w-full items-end gap-2 rounded-2xl border p-3 pl-4 shadow-sm focus-within:ring-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onSubmit();
      }}
    >
      <label htmlFor="question" className="sr-only">
        Ask a question about the data
      </label>
      <Textarea
        ref={inputRef}
        id="question"
        value={question}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // Enter submits; Shift+Enter inserts a newline.
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (canSubmit) onSubmit();
          }
        }}
        maxLength={MAX_QUESTION_LENGTH}
        rows={1}
        placeholder="Ask a question about the data…"
        aria-describedby="question-hint"
        className="max-h-40 min-h-12 flex-1 resize-none border-0 bg-transparent px-0 py-2 text-base shadow-none focus-visible:ring-0 dark:bg-transparent"
      />
      <p id="question-hint" className="sr-only">
        I&apos;ll suggest a query. Nothing runs until you click Run.
      </p>
      <Button type="submit" size="icon-lg" disabled={!canSubmit} aria-label="Suggest SQL" className="rounded-xl">
        <ArrowUpIcon />
      </Button>
    </form>
  );
}
