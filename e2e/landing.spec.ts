import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;

async function open(page: Page) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
}

const prompt = (page: Page) => page.getByLabel("Ask a question about the data");

test.describe("landing view (before the first question)", () => {
  test("asks 'What do you want to analyze?' with the prompt box centered on the page", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page);

    const heading = page.getByRole("heading", { name: "What do you want to analyze?" });
    await expect(heading).toBeVisible();

    const box = (await page.locator("form").filter({ has: prompt(page) }).boundingBox())!;
    const h = (await heading.boundingBox())!;
    // Heading above the box, box horizontally centered, vertically in the middle band of the screen.
    expect(h.y + h.height).toBeLessThan(box.y);
    expect(Math.abs(box.x + box.width / 2 - 1280 / 2)).toBeLessThan(8);
    const centerY = box.y + box.height / 2;
    expect(centerY).toBeGreaterThan(800 * 0.25);
    expect(centerY).toBeLessThan(800 * 0.6);
  });

  test("the example prompts sit under the prompt box", async ({ page }) => {
    await open(page);
    const box = (await page.locator("form").filter({ has: prompt(page) }).boundingBox())!;
    const first = (await page.getByRole("button", { name: "How many unique customers do we have?" }).boundingBox())!;
    expect(first.y).toBeGreaterThan(box.y + box.height);
  });

  for (const size of [
    { width: 1280, height: 720 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    test(`the About section is already peeking in at the fold on ${size.width}x${size.height}`, async ({ page }) => {
      await page.setViewportSize(size);
      await open(page);
      const about = page.getByRole("heading", { name: "About SiyasatQL" });
      await expect(about).toBeInViewport(); // no scrolling needed to notice it
      const b = (await about.boundingBox())!;
      // ...but it is only a glimpse: the section's last content is still below the fold.
      const bottom = (await page.getByText("Not affiliated with Olist").last().boundingBox())!;
      expect(b.y + b.height).toBeLessThan(size.height);
      expect(bottom.y).toBeGreaterThan(size.height);
    });
  }

  test("there is whitespace between the examples and the About section", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page);
    const lastExample = (await page.getByRole("button", { name: "What is the average review score for each customer state?" }).boundingBox())!;
    const about = (await page.getByRole("heading", { name: "About SiyasatQL" }).boundingBox())!;
    expect(about.y - (lastExample.y + lastExample.height)).toBeGreaterThanOrEqual(48);
  });

  test("the About section explains the data: what Olist is, headline numbers, tables, dates and currency", async ({ page }) => {
    await open(page);
    const about = page.locator("section", { has: page.getByRole("heading", { name: "About SiyasatQL" }) });
    await expect(about).toContainText("Olist");
    await expect(about).toContainText("Brazilian");
    for (const stat of ["99,441", "96,096", "3,095", "32,951"]) await expect(about).toContainText(stat);
    const tables = about.getByRole("list", { name: "Tables in the database" });
    for (const table of ["orders", "order_items", "order_payments", "order_reviews", "customers", "products", "sellers"]) {
      await expect(tables.getByText(table, { exact: true })).toBeVisible();
    }
    await expect(about).toContainText("Brazilian reais");
    await expect(about).toContainText("2016");
    await expect(about).toContainText("2018");
  });

  test("keeps the dataset attribution and the review-before-running disclaimer visible on the page", async ({ page }) => {
    await open(page);
    await expect(page.getByRole("link", { name: "CC BY-NC-SA 4.0" })).toBeVisible();
    await expect(page.getByText("review them before running")).toBeVisible();
  });

  test("has no 'Back to homepage' button and no reply controls", async ({ page }) => {
    await open(page);
    await expect(page.getByRole("button", { name: "Back to homepage" })).toHaveCount(0);
  });
});
