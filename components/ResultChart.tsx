"use client";

import { useSyncExternalStore } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { ChartSpec } from "@/lib/chart/select";

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const truncate = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

// Recharts doesn't keep the tooltip inside a chart that is narrower than its anchor point, so on
// phones it is pinned to the chart's left edge (the tooltip is capped to fit the width).
const PHONE = "(max-width: 639px)";
const subscribePhone = (cb: () => void) => {
  const mq = window.matchMedia(PHONE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const useIsPhone = () =>
  useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE).matches, () => false);

export function ResultChart({ spec }: { spec: ChartSpec }) {
  const phone = useIsPhone();
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
  // Many bars or long names don't fit under a vertical bar chart (rotated labels collide and
  // clip on phones), so lay the bars out horizontally with the names on the left instead.
  const horizontal = spec.type === "bar" && (spec.data.length > 8 || spec.data.some((d) => String(d.x).length > 14));
  const chartHeight = horizontal ? Math.max(320, spec.data.length * 28 + 24) : 320;

  return (
    <Card>
      <CardContent className="pt-6">
        <div role="img" aria-label={description}>
          <ChartContainer config={config} className="aspect-auto w-full" style={{ height: chartHeight }}>
            {spec.type === "bar" && horizontal ? (
              <BarChart accessibilityLayer data={spec.data} layout="vertical" margin={{ left: 0, right: 16 }}>
                <CartesianGrid horizontal={false} />
                <YAxis
                  dataKey="x"
                  type="category"
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  width={120}
                  tickFormatter={(v: string) => truncate(String(v), 16)}
                />
                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={false}
                  tickCount={3}
                  tickFormatter={(v: number) => compact.format(v)}
                />
                <ChartTooltip position={phone ? { x: 0 } : undefined} content={<ChartTooltipContent className="max-w-56" labelClassName="break-all" />} />
                <Bar dataKey="y" fill="var(--color-y)" radius={4} />
              </BarChart>
            ) : spec.type === "bar" ? (
              <BarChart accessibilityLayer data={spec.data} margin={{ bottom: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="x" tickLine={false} axisLine={false} interval={0} height={30} />
                <YAxis tickLine={false} axisLine={false} width={64} tickFormatter={(v: number) => v.toLocaleString()} />
                <ChartTooltip content={<ChartTooltipContent className="max-w-56" labelClassName="break-all" />} />
                <Bar dataKey="y" fill="var(--color-y)" radius={4} />
              </BarChart>
            ) : (
              <LineChart accessibilityLayer data={spec.data} margin={{ left: 8, right: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="x" tickLine={false} axisLine={false} minTickGap={32} />
                <YAxis tickLine={false} axisLine={false} width={64} tickFormatter={(v: number) => v.toLocaleString()} />
                <ChartTooltip content={<ChartTooltipContent className="max-w-56" labelClassName="break-all" />} />
                <Line dataKey="y" type="monotone" stroke="var(--color-y)" strokeWidth={2} dot={spec.data.length <= 40} />
              </LineChart>
            )}
          </ChartContainer>
        </div>
      </CardContent>
    </Card>
  );
}
