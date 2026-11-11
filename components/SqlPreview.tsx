import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  sql: string;
  onChange: (sql: string) => void;
  onRun: () => void;
  running: boolean;
};

/** Editable SQL with an explicit Run button. Nothing ever runs automatically. */
export function SqlPreview({ sql, onChange, onRun, running }: Props) {
  return (
    <div className="space-y-3">
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
      <div className="flex items-center gap-3">
        <Button onClick={onRun} disabled={running || !sql.trim()}>
          {running ? "Running…" : "Run query"}
        </Button>
        <p id="sql-hint" className="text-muted-foreground text-xs">
          Read-only. Press Ctrl+Enter to run.
        </p>
      </div>
    </div>
  );
}
