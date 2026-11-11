"use client";

import { ResultChart } from "@/components/ResultChart";
import { ResultsTable } from "@/components/ResultsTable";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { RunSuccess } from "@/lib/api-types";

/** Summary line plus a Table/Chart switch (chart tab only when a chart fits). */
export function ResultsView({ result }: { result: RunSuccess }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">
          {result.rowCount.toLocaleString()} {result.rowCount === 1 ? "row" : "rows"}
        </Badge>
        <Badge variant="outline">{result.durationMs} ms</Badge>
        {result.truncated && (
          <span className="text-muted-foreground text-sm">
            Showing the first {result.rowCount.toLocaleString()} rows. Add a filter or LIMIT to narrow the result.
          </span>
        )}
      </div>

      {result.chart ? (
        <Tabs defaultValue="chart">
          <TabsList>
            <TabsTrigger value="chart">Chart</TabsTrigger>
            <TabsTrigger value="table">Table</TabsTrigger>
          </TabsList>
          <TabsContent value="chart">
            <ResultChart spec={result.chart} />
          </TabsContent>
          <TabsContent value="table">
            <ResultsTable result={result} />
          </TabsContent>
        </Tabs>
      ) : (
        <ResultsTable result={result} />
      )}
    </div>
  );
}
