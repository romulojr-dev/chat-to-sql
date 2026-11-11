"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { ChartSpec } from "@/lib/chart/select";

export function ResultChart({ spec }: { spec: ChartSpec }) {
  if (spec.type === "number") {
    return (
      <Card className="max-w-sm">
        <CardHeader>
          <CardDescription>{spec.label}</CardDescription>
          <p className="text-4xl font-semibold tabular-nums">{spec.value.toLocaleString()}</p>
        </CardHeader>
      </Card>
    );
  }

  const config = { y: { label: spec.yLabel, color: "var(--chart-1)" } } satisfies ChartConfig;
  const description = `${spec.type === "bar" ? "Bar" : "Line"} chart of ${spec.yLabel} by ${spec.xLabel}, ${spec.data.length} points. The same data is in the Table tab.`;
  const manyLabels = spec.data.length > 8;

  return (
    <Card>
      <CardContent className="pt-6">
        <div role="img" aria-label={description}>
          <ChartContainer config={config} className="aspect-auto h-80 w-full">
            {spec.type === "bar" ? (
              <BarChart accessibilityLayer data={spec.data} margin={{ bottom: manyLabels ? 48 : 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="x"
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  angle={manyLabels ? -35 : 0}
                  textAnchor={manyLabels ? "end" : "middle"}
                  height={manyLabels ? 70 : 30}
                />
                <YAxis tickLine={false} axisLine={false} width={64} tickFormatter={(v: number) => v.toLocaleString()} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="y" fill="var(--color-y)" radius={4} />
              </BarChart>
            ) : (
              <LineChart accessibilityLayer data={spec.data} margin={{ left: 8, right: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="x" tickLine={false} axisLine={false} minTickGap={32} />
                <YAxis tickLine={false} axisLine={false} width={64} tickFormatter={(v: number) => v.toLocaleString()} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line dataKey="y" type="monotone" stroke="var(--color-y)" strokeWidth={2} dot={spec.data.length <= 40} />
              </LineChart>
            )}
          </ChartContainer>
        </div>
      </CardContent>
    </Card>
  );
}
