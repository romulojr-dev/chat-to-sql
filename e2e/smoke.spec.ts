import { expect, test } from "@playwright/test";
import { json, RESULT, stubApi, SUGGESTION } from "./stubs";

type Page = import("@playwright/test").Page;

/** Open the app and wait until its scripts have loaded, so clicks reach React's handlers. */
async function open(page: Page) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
}

/** The app's own alerts; Next.js also renders an invisible role="alert" route announcer. */
const alertWith = (page: Page, text: string | RegExp) => page.locator('[data-slot="alert"]').filter({ hasText: text });

const question = (page: import("@playwright/test").Page) => page.getByLabel("Ask a question about the data");
const sqlBox = (page: import("@playwright/test").Page) => page.getByLabel("SQL query");

test.describe("question -> SQL -> Run -> results (model and database stubbed)", () => {
  test("an example question gives a suggestion, and nothing runs until Run is clicked", async ({ page }) => {
    const calls = await stubApi(page);
    await open(page);
    await expect(page.getByRole("heading", { name: "SiyasatQL" })).toBeVisible();

    await page.getByRole("button", { name: "How many unique customers do we have?" }).click();

    // The suggestion appears with its plain-language explanation and the SQL, editable.
    await expect(sqlBox(page)).toHaveValue(SUGGESTION.sql);
    await expect(page.getByText(SUGGESTION.explanation)).toBeVisible();
    expect(calls.suggest).toEqual([{ question: "How many unique customers do we have?" }]);

    // Safety property: the query was only suggested, not run.
    expect(calls.run).toHaveLength(0);
    await expect(page.getByRole("table")).toHaveCount(0);

    await page.getByRole("button", { name: "Run query" }).click();

    await expect(page.getByRole("tab", { name: "Chart" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("img", { name: /Bar chart of orders by order_status/ })).toBeVisible();
    expect(calls.run).toEqual([{ sql: SUGGESTION.sql }]);

    await page.getByRole("tab", { name: "Table" }).click();
    const table = page.getByRole("table");
    await expect(table).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "order_status" })).toBeVisible();
    await expect(table.getByRole("cell", { name: "delivered" })).toBeVisible();
    await expect(table.getByRole("cell", { name: "96478" })).toBeVisible();
    await expect(page.getByText("3 rows")).toBeVisible();
  });

  test("the user can edit the SQL, and the edited SQL is what runs", async ({ page }) => {
    const calls = await stubApi(page);
    await open(page);
    await question(page).fill("orders by status");
    await page.getByRole("button", { name: "Suggest SQL" }).click();
    await expect(sqlBox(page)).toHaveValue(SUGGESTION.sql);

    await sqlBox(page).fill("SELECT count(*) AS n FROM orders");
    await page.getByRole("button", { name: "Run query" }).click();
    await expect(page.getByRole("tab", { name: "Chart" })).toBeVisible();
    expect(calls.run).toEqual([{ sql: "SELECT count(*) AS n FROM orders" }]);
  });

  test("a new question clears the previous results", async ({ page }) => {
    await stubApi(page);
    await open(page);
    await page.getByRole("button", { name: "How many unique customers do we have?" }).click();
    await page.getByRole("button", { name: "Run query" }).click();
    await expect(page.getByRole("tab", { name: "Chart" })).toBeVisible();

    await question(page).fill("something else");
    await page.getByRole("button", { name: "Suggest SQL" }).click();
    await expect(sqlBox(page)).toHaveValue(SUGGESTION.sql);
    await expect(page.getByRole("tab", { name: "Chart" })).toHaveCount(0);
  });

  test("a question the data cannot answer shows a calm message, not an error", async ({ page }) => {
    await stubApi(page, {
      suggest: json({ error: { code: "cannot_answer", message: "That is not in this data." } }, 422),
    });
    await open(page);
    await question(page).fill("What is the weather in Manila?");
    await page.getByRole("button", { name: "Suggest SQL" }).click();

    const alert = alertWith(page, "I can't answer that from this data");
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("That is not in this data.");
    await expect(page.getByRole("button", { name: "Run query" })).toHaveCount(0);
  });

  test("being rate limited shows a friendly message", async ({ page }) => {
    await stubApi(page, {
      run: (route) => route.fulfill({ status: 429, contentType: "text/html", body: "<html>Too many</html>" }),
    });
    await open(page);
    await page.getByRole("button", { name: "How many unique customers do we have?" }).click();
    await page.getByRole("button", { name: "Run query" }).click();

    const alert = alertWith(page, "That query could not run");
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/too many requests/i);
    await expect(alert).not.toContainText("<html>");
  });

  test("a result with no chart shows just the table", async ({ page }) => {
    await stubApi(page, { run: json({ ...RESULT, chart: null }) });
    await open(page);
    await page.getByRole("button", { name: "How many unique customers do we have?" }).click();
    await page.getByRole("button", { name: "Run query" }).click();

    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByRole("tab")).toHaveCount(0);
  });
});

test("a slow first query (suspended database) explains itself and still completes", async ({ page }) => {
  // The first query after a quiet period can take ~4 s while the free-tier database wakes up.
  await stubApi(page, {
    run: async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 4_000));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(RESULT) });
    },
  });
  await open(page);
  await page.getByRole("button", { name: "How many unique customers do we have?" }).click();
  await page.getByRole("button", { name: "Run query" }).click();

  // While waiting: a loading state, and after ~2.5 s the explanation.
  await expect(page.getByRole("status", { name: "Running query" })).toBeVisible();
  await expect(page.getByText("Waking up the database")).toHaveCount(0);
  await expect(page.getByText("Waking up the database")).toBeVisible({ timeout: 3_500 });

  // Then the results arrive and the hint goes away.
  await expect(page.getByRole("tab", { name: "Chart" })).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText("Waking up the database")).toHaveCount(0);
});

test.describe("keyboard only", () => {
  test("ask with Enter, then run with Ctrl+Enter, without touching the mouse", async ({ page }) => {
    const calls = await stubApi(page);
    await open(page);

    await page.keyboard.press("Tab"); // first stop on the page
    await expect(question(page)).toBeFocused();
    await page.keyboard.type("orders by status");
    await page.keyboard.press("Enter");

    await expect(sqlBox(page)).toHaveValue(SUGGESTION.sql);
    expect(calls.run).toHaveLength(0);

    await sqlBox(page).focus();
    await page.keyboard.press("Control+Enter");
    await expect(page.getByRole("tab", { name: "Chart" })).toBeVisible();
    expect(calls.run).toHaveLength(1);
  });

  test("Shift+Enter adds a line to the question instead of submitting", async ({ page }) => {
    const calls = await stubApi(page);
    await open(page);
    await question(page).focus();
    await page.keyboard.type("first line");
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type("second line");
    await expect(question(page)).toHaveValue("first line\nsecond line");
    expect(calls.suggest).toHaveLength(0);
  });
});

test("the live site's real /api/run works end to end (opt-in: E2E_LIVE=1, needs the database)", async ({ page }) => {
  test.skip(process.env.E2E_LIVE !== "1", "set E2E_LIVE=1 to run against the real database");
  await stubApi(page, { run: (route) => route.continue() }); // only the model is stubbed
  await open(page);
  await page.getByRole("button", { name: "How many unique customers do we have?" }).click();
  await sqlBox(page).fill("SELECT count(DISTINCT customer_unique_id) AS unique_customers FROM customers");
  await page.getByRole("button", { name: "Run query" }).click();
  await expect(page.getByText("96,096").first()).toBeVisible({ timeout: 20_000 }); // number card, thousands-separated
});
