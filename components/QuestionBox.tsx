import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MAX_QUESTION_LENGTH } from "@/lib/llm/prompt";

type Props = {
  question: string;
  onChange: (question: string) => void;
  onSubmit: () => void;
  busy: boolean;
};

export function QuestionBox({ question, onChange, onSubmit, busy }: Props) {
  const canSubmit = !busy && question.trim().length > 0;

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onSubmit();
      }}
    >
      <label htmlFor="question" className="text-sm font-medium">
        Ask a question about the data
      </label>
      <Textarea
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
        rows={2}
        placeholder="e.g. Which product categories earned the most revenue in 2017?"
        aria-describedby="question-hint"
      />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={!canSubmit}>
          {busy ? "Thinking…" : "Suggest SQL"}
        </Button>
        <p id="question-hint" className="text-muted-foreground text-xs">
          I&apos;ll suggest a query. Nothing runs until you click Run.
        </p>
      </div>
    </form>
  );
}
