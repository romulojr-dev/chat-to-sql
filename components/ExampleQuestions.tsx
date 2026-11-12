import { Button } from "@/components/ui/button";

// Each of these was verified end to end against the real model and database.
export const EXAMPLE_QUESTIONS = [
  "How many orders were placed in each month of 2017?",
  "What are the top 5 product categories by revenue?",
  "How many unique customers do we have?",
  "Show me the payment types and how many orders used each",
  "What is the average review score for each customer state?",
];

type Props = { onPick: (question: string) => void; disabled: boolean };

export function ExampleQuestions({ onPick, disabled }: Props) {
  return (
    <div className="space-y-2">
      <p id="examples-label" className="text-muted-foreground text-sm">
        Or try an example:
      </p>
      <ul aria-labelledby="examples-label" className="flex flex-wrap gap-2">
        {EXAMPLE_QUESTIONS.map((q) => (
          <li key={q}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => onPick(q)}
              className="h-auto whitespace-normal py-1.5 text-left"
            >
              {q}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
