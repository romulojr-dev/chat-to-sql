import { Button } from "@/components/ui/button";

// Each of these was verified end to end against the real model and database.
export const EXAMPLE_QUESTIONS = [
  "How many orders were placed in each month of 2017?",
  "What are the top 5 product categories by revenue?",
  "How many unique customers do we have?",
  "Show me the payment types and how many orders used each",
  "What is the average review score for each customer state?",
];

type Props = { onPick: (question: string) => void };

export function ExampleQuestions({ onPick }: Props) {
  return (
    <div>
      <p id="examples-label" className="sr-only">
        Or try an example:
      </p>
      <ul aria-labelledby="examples-label" className="flex flex-wrap justify-center gap-2">
        {EXAMPLE_QUESTIONS.map((q) => (
          <li key={q}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onPick(q)}
              className="h-auto rounded-full px-3.5 py-1.5 text-center whitespace-normal dark:bg-background dark:hover:bg-muted"
            >
              {q}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
