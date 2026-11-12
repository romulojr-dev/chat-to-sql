import { expect, test } from "@playwright/test";
import { json, stubApi, SUGGESTION } from "./stubs";

type Page = import("@playwright/test").Page;

async function open(page: Page) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
}

const EXAMPLE = "How many unique customers do we have?";
const slow = (ms: number) => async (route: import("@playwright/test").Route) => {
  await new Promise((r) => setTimeout(r, ms));
  await json(SUGGESTION)(route);
};
const cannotAnswer = (route: import("@playwright/test").Route) =>
  json({ error: { code: "cannot_answer", message: "That is not in this data." } }, 422)(route);
const unsafe = (route: import("@playwright/test").Route) =>
  json({ error: { code: "unsafe_sql", message: "The assistant suggested a query that isn't allowed." } }, 422)(route);

test.describe("chat view (after the question is sent)", () => {
  test("replaces the landing view: question bubble in, landing and About out", async ({ page }) => {
    await stubApi(page);
    await open(page);
    await page.getByRole("button", { name: EXAMPLE }).click();

    await expect(page.getByText(EXAMPLE, { exact: true })).toBeVisible(); // the user's bubble
    await expect(page.getByRole("heading", { name: "What do you want to analyze?" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "About SiyasatQL" })).toHaveCount(0);
  });

  test("has no reply box: the question can't be answered or followed up", async ({ page }) => {
    await stubApi(page);
    await open(page);
    await page.getByRole("button", { name: EXAMPLE }).click();
    await expect(page.getByLabel("SQL query")).toHaveValue(SUGGESTION.sql);

    await expect(page.getByLabel("Ask a question about the data")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Suggest SQL" })).toHaveCount(0);
  });

  test("shows the Trace of real steps while working, and keeps it visible afterwards", async ({ page }) => {
    await stubApi(page, { suggest: slow(800) });
    await open(page);
    await page.getByRole("button", { name: EXAMPLE }).click();

    const trace = page.locator('[data-slot="trace"]');
    await expect(trace).toBeVisible();
    await expect(trace.locator('[data-slot="trace-line"][data-status="running"]')).toContainText("Writing a read-only SQL query");
    await expect(trace.locator('[data-slot="trace-line"][data-status="pending"]')).toContainText("Checking it is read-only");

    await expect(page.getByLabel("SQL query")).toHaveValue(SUGGESTION.sql);
    // Not hidden by default once finished, and nothing is invented: exactly the two real steps.
    await expect(trace).toBeVisible();
    await expect(trace.locator('[data-slot="trace-line"]')).toHaveCount(2);
    await expect(trace).toContainText("Wrote a read-only SQL query");
    await expect(trace).toContainText("Checked that it only reads data");
    await expect(trace.locator('[data-status="running"], [data-status="pending"], [data-status="error"]')).toHaveCount(0);
    await expect(trace).toContainText(/\d+(\.\d)?s/); // measured time, not a made-up number
  });

  test("nothing runs until Run; after Run the results, the no-replies note and the home button appear", async ({ page }) => {
    const calls = await stubApi(page);
    await open(page);
    await page.getByRole("button", { name: EXAMPLE }).click();
    await expect(page.getByLabel("SQL query")).toHaveValue(SUGGESTION.sql);

    expect(calls.run).toHaveLength(0);
    await expect(page.getByRole("button", { name: "Back to homepage" })).toHaveCount(0);

    await page.getByRole("button", { name: "Run query" }).click();
    await expect(page.getByRole("tab", { name: "Chart" })).toBeVisible();
    expect(calls.run).toHaveLength(1);

    await expect(page.getByText(/can't take replies or follow-ups/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Back to homepage" })).toBeVisible();
  });

  test("Back to homepage returns to a clean landing view with the prompt box focused", async ({ page }) => {
    await stubApi(page);
    await open(page);
    await page.getByRole("button", { name: EXAMPLE }).click();
    await page.getByRole("button", { name: "Run query" }).click();
    await page.getByRole("button", { name: "Back to homepage" }).click();

    await expect(page.getByRole("heading", { name: "What do you want to analyze?" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "About SiyasatQL" })).toBeVisible();
    await expect(page.getByLabel("Ask a question about the data")).toHaveValue("");
    await expect(page.getByLabel("Ask a question about the data")).toBeFocused();
    await expect(page.getByLabel("SQL query")).toHaveCount(0);
    await expect(page.getByRole("table")).toHaveCount(0);
  });

  test("a second question after going home starts clean (nothing left from the first)", async ({ page }) => {
    const calls = await stubApi(page);
    await open(page);
    await page.getByRole("button", { name: EXAMPLE }).click();
    await page.getByRole("button", { name: "Run query" }).click();
    await page.getByRole("button", { name: "Back to homepage" }).click();

    await page.getByLabel("Ask a question about the data").fill("orders by status");
    await page.getByRole("button", { name: "Suggest SQL" }).click();
    await expect(page.getByLabel("SQL query")).toHaveValue(SUGGESTION.sql);
    expect(calls.suggest).toEqual([{ question: EXAMPLE }, { question: "orders by status" }]);
    await expect(page.getByRole("tab", { name: "Chart" })).toHaveCount(0); // old results are gone
  });

  test("a question the data can't answer: the Trace shows the failed step, a calm alert, and a way home", async ({ page }) => {
    await stubApi(page, { suggest: cannotAnswer });
    await open(page);
    await page.getByLabel("Ask a question about the data").fill("weather?");
    await page.getByRole("button", { name: "Suggest SQL" }).click();

    await expect(page.locator('[data-slot="alert"]')).toContainText("I can't answer that from this data");
    await expect(page.locator('[data-slot="trace-line"][data-status="error"]')).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Back to homepage" })).toBeVisible();
  });

  test("a blocked query shows the read-only check as the step that failed", async ({ page }) => {
    await stubApi(page, { suggest: unsafe });
    await open(page);
    await page.getByRole("button", { name: EXAMPLE }).click();

    const failed = page.locator('[data-slot="trace-line"][data-status="error"]');
    await expect(failed).toContainText("read-only");
    await expect(page.getByLabel("SQL query")).toHaveCount(0); // unsafe SQL is never shown
    await expect(page.getByRole("button", { name: "Back to homepage" })).toBeVisible();
  });
});
