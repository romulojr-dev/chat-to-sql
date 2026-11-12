import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  sql: string;
  explanation?: string;
  onChange: (sql: string) => void;
  onRun: () => void;
  running: boolean;
};

/** Editable SQL with an explicit Run button. Nothing ever runs automatically. */
export function SqlPreview({ sql, explanation, onChange, onRun, running }: Props) {
  return (
    <div className="space-y-3">
      {explanation && (
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <span className="font-medium">What this does: </span>
          {explanation}
        </div>
      )}
      <label htmlFor="sql" className="text-sm font-medium">
        SQL query
      </label>
      <Textarea
        id="sql"
        value={sql}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !running && sql.trim()) {
            e.preventDefault();
            onRun();
          }
        }}
        spellCheck={false}
        rows={6}
        className="font-mono text-sm"
        aria-describedby="sql-hint"
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onRun} disabled={running || !sql.trim()}>
          {running ? "Running…" : "Run query"}
        </Button>
        <p id="sql-hint" className="text-muted-foreground text-xs">
          Review the query, edit it if you like, then run it. Read-only. Ctrl+Enter also runs.
        </p>
      </div>
    </div>
  );
}
