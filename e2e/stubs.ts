import type { Page, Route } from "@playwright/test";

/** A realistic /api/suggest response. The SQL is the one verified against the real database. */
export const SUGGESTION = {
  sql: "SELECT order_status, count(*) AS orders FROM orders GROUP BY 1 ORDER BY 2 DESC",
  explanation: "Counts how many orders are in each status, from most common to least common.",
  usage: { inputTokens: 2400, outputTokens: 120 },
};

/** A realistic /api/run response with a bar chart. */
export const RESULT = {
  columns: ["order_status", "orders"],
  rows: [
    ["delivered", "96478"],
    ["shipped", "1107"],
    ["canceled", "625"],
  ],
  rowCount: 3,
  truncated: false,
  durationMs: 41,
  chart: {
    type: "bar",
    xLabel: "order_status",
    yLabel: "orders",
    data: [
      { x: "delivered", y: 96478 },
      { x: "shipped", y: 1107 },
      { x: "canceled", y: 625 },
    ],
  },
};

type Handler = (route: Route) => Promise<void> | void;

export const json = (body: unknown, status = 200): Handler => (route) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

/**
 * Replace the two API routes with stubs, so no model call or database query happens.
 * Returns the requests the page made, so tests can assert what was (not) sent.
 */
export async function stubApi(
  page: Page,
  handlers: { suggest?: Handler; run?: Handler } = {},
) {
  const calls = { suggest: [] as unknown[], run: [] as unknown[] };
  await page.route("**/api/suggest", async (route) => {
    calls.suggest.push(route.request().postDataJSON());
    await (handlers.suggest ?? json(SUGGESTION))(route);
  });
  await page.route("**/api/run", async (route) => {
    calls.run.push(route.request().postDataJSON());
    await (handlers.run ?? json(RESULT))(route);
  });
  return calls;
}
