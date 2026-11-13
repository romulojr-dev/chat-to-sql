import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { RunSuccess } from "@/lib/api-types";

const isNumeric = (v: unknown) =>
  typeof v === "number" || (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)));

function Cell({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground italic">NULL</span>;
  }
  if (typeof value === "object") return <>{JSON.stringify(value)}</>;
  return <>{String(value)}</>;
}

export function ResultsTable({ result }: { result: RunSuccess }) {
  // Right-align a column when its first non-null value looks numeric.
  const numericCols = result.columns.map((_, i) => {
    const first = result.rows.find((r) => r[i] !== null && r[i] !== undefined)?.[i];
    return first !== undefined && isNumeric(first);
  });

  return (
    <div>
      {result.rowCount === 0 ? (
        <p className="text-muted-foreground text-sm">The query ran but returned no rows.</p>
      ) : (
        <div className="max-h-[28rem] overflow-auto rounded-md border">
          <Table containerClassName="scroll-shadow-x">
            <TableHeader className="bg-background sticky top-0">
              <TableRow>
                {result.columns.map((c, i) => (
                  <TableHead key={`${c}-${i}`} className={numericCols[i] ? "text-right" : undefined}>
                    {c}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((row, r) => (
                <TableRow key={r}>
                  {row.map((value, i) => (
                    <TableCell key={i} className={numericCols[i] ? "text-right tabular-nums" : undefined}>
                      <Cell value={value} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
