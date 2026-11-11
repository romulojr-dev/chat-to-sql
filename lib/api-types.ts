/** Shapes returned by /api/run. Shared by the route handler and the UI. */

export type RunSuccess = {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  truncated: boolean;
  durationMs: number;
  chart: null; // populated in T6
};

export type ApiError = {
  error: { code: string; message: string };
};
