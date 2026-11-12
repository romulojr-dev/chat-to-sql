import { expect, test, type Page } from "@playwright/test";
import { json, stubApi } from "./stubs";

/**
 * Captures the README screenshots from the real app with REAL data (only the model is
 * stubbed, using SQL that was verified against the database).
 * Opt-in: E2E_SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts
 */
test.skip(process.env.E2E_SCREENSHOTS !== "1", "set E2E_SCREENSHOTS=1 to capture screenshots");

const CASES = [
  {
    name: "revenue-bar",
    question: "What are the top 5 product categories by revenue?",
    sql: `SELECT COALESCE(t.product_category_name_english, p.product_category_name) AS category, sum(oi.price) AS revenue
FROM order_items oi JOIN orders o ON o.order_id = oi.order_id JOIN products p ON p.product_id = oi.product_id
LEFT JOIN product_category_name_translation t ON t.product_category_name = p.product_category_name
WHERE o.order_status NOT IN ('canceled', 'unavailable') GROUP BY 1 ORDER BY 2 DESC LIMIT 5`,
    explanation: "Adds up the money from item sales for each product category, leaving out canceled orders, and shows the five biggest.",
  },
  {
    name: "orders-line",
    question: "How many orders were placed in each month of 2017?",
    sql: `SELECT date_trunc('month', order_purchase_timestamp) AS month, count(*) AS orders
FROM orders WHERE order_purchase_timestamp >= '2017-01-01' AND order_purchase_timestamp < '2018-01-01' GROUP BY 1 ORDER BY 1`,
    explanation: "Counts the orders placed in each month of 2017, in calendar order.",
  },
];

async function shoot(page: Page, name: string, viewport: { width: number; height: number }, tag: string) {
  await page.setViewportSize(viewport);
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `docs/screenshots/${tag}-home.png`, fullPage: true });

  const c = CASES.find((x) => x.name === name)!;
  await stubApi(page, {
    suggest: json({ sql: c.sql, explanation: c.explanation, usage: { inputTokens: 2400, outputTokens: 150 } }),
    run: (route) => route.continue(), // real database
  });
  await page.getByLabel("Ask a question about the data").fill(c.question);
  await page.getByRole("button", { name: "Suggest SQL" }).click();
  await expect(page.getByLabel("SQL query")).not.toHaveValue("");
  await page.getByRole("button", { name: "Run query" }).click();
  await expect(page.getByRole("tab", { name: "Chart" })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".recharts-surface").first()).toBeVisible();
  await page.waitForTimeout(800); // let the chart animation settle
  await page.screenshot({ path: `docs/screenshots/${tag}-${name}-chart.png`, fullPage: true });

  await page.getByRole("tab", { name: "Table" }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Table" })).toHaveAttribute("aria-selected", "true");
  await page.waitForTimeout(600); // let the tab indicator finish animating
  await page.screenshot({ path: `docs/screenshots/${tag}-${name}-table.png`, fullPage: true });
}

test("desktop screenshots", async ({ page }) => {
  await shoot(page, "revenue-bar", { width: 1280, height: 900 }, "desktop");
});

test("phone screenshots (375 px wide)", async ({ page }) => {
  await shoot(page, "orders-line", { width: 375, height: 812 }, "phone");
});
