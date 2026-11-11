import type { ChartSpec } from "./chart/select";

/** Shapes returned by /api/run. Shared by the route handler and the UI. */

export type RunSuccess = {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  truncated: boolean;
  durationMs: number;
  chart: ChartSpec | null;
};

export type ApiError = {
  error: { code: string; message: string };
};
