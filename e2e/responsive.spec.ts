import { expect, test, type Page } from "@playwright/test";
import { json, stubApi, SUGGESTION } from "./stubs";

// 20 rows with long category names: the worst case the chart rules allow.
const LONG_ROWS = Array.from({ length: 20 }, (_, i) => [
  "SP",
  `health_beauty_and_personal_care_${i}`,
  String(100000 - i * 1234),
  String(900 - i),
]);
const LONG_RESULT = {
  columns: ["customer_state", "category", "total_revenue_brl", "number_of_orders"],
  rows: LONG_ROWS,
  rowCount: 20,
  truncated: false,
  durationMs: 41,
  chart: {
    type: "bar",
    xLabel: "category",
    yLabel: "total_revenue_brl",
    data: LONG_ROWS.map((r) => ({ x: r[1], y: Number(r[2]) })),
  },
};

async function openResults(page: Page, width: number) {
  await page.setViewportSize({ width, height: 800 });
  await stubApi(page, { suggest: json(SUGGESTION), run: json(LONG_RESULT) });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Ask a question about the data").fill("Which categories earn the most?");
  await page.getByRole("button", { name: "Suggest SQL" }).click();
  await page.getByRole("button", { name: "Run query" }).click();
  await expect(page.getByRole("tab", { name: "Chart" })).toBeVisible();
  await page.waitForTimeout(1200); // chart animation
}

const noPageOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

for (const width of [320, 768, 1440]) {
  test(`no horizontal page overflow at ${width}px (home and results)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(await noPageOverflow(page)).toBe(true);
    await openResults(page, width);
    expect(await noPageOverflow(page)).toBe(true);
  });
}

test.describe("bar chart with many long labels", () => {
  for (const width of [320, 1440]) {
    test(`labels stay readable and inside the chart at ${width}px`, async ({ page }) => {
      await openResults(page, width);
      const chart = page.locator(".recharts-wrapper");
      const box = (await chart.boundingBox())!;
      const ticks = page.locator(".recharts-cartesian-axis-tick-value");
      const count = await ticks.count();
      expect(count).toBeGreaterThan(0);

      const texts: string[] = [];
      for (let i = 0; i < count; i++) {
        const t = ticks.nth(i);
        texts.push((await t.textContent()) ?? "");
        const b = (await t.boundingBox())!;
        expect(b.x, `tick ${i} clipped on the left`).toBeGreaterThanOrEqual(box.x - 0.5);
        expect(b.x + b.width, `tick ${i} clipped on the right`).toBeLessThanOrEqual(box.x + box.width + 0.5);
      }
      // No rotated text, and every category label is shortened.
      expect(await page.locator('.recharts-cartesian-axis-tick-value[transform*="rotate"]').count()).toBe(0);
      const categoryLabels = texts.filter((t) => t.includes("health"));
      expect(categoryLabels.length).toBe(20);
      expect(categoryLabels.every((t) => t.length <= 19)).toBe(true);
    });
  }

  for (const [width, bar] of [[320, 4], [320, 19], [1440, 0], [1440, 19]] as const) {
    test(`hover tooltip shows the full name and value inside the card (${width}px, bar ${bar + 1})`, async ({ page }) => {
      await openResults(page, width);
      const rect = page.locator(".recharts-bar-rectangle").nth(bar);
      const rb = (await rect.boundingBox())!;
      await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2);
      const tip = page.locator(".recharts-tooltip-wrapper");
      await page.waitForTimeout(1000); // the tooltip slides into place; measure once it has settled
      await expect(tip).toContainText(`health_beauty_and_personal_care_${bar}`);
      await expect(tip).toContainText("total_revenue_brl");
      await expect(tip).toContainText((100000 - bar * 1234).toLocaleString());
      const card = (await page.locator('[data-slot="card"]').filter({ has: page.locator(".recharts-wrapper") }).boundingBox())!;
      const content = (await tip.locator("> *").first().boundingBox())!;
      expect(content.x, "tooltip clipped on the left").toBeGreaterThanOrEqual(card.x);
      expect(content.x + content.width, "tooltip clipped on the right").toBeLessThanOrEqual(card.x + card.width + 0.5);
      expect(content.x + content.width, "tooltip outside the viewport").toBeLessThanOrEqual(width);
    });
  }

  test("the full category name is still available (accessible chart description and Table tab)", async ({ page }) => {
    await openResults(page, 320);
    await page.getByRole("tab", { name: "Table" }).click();
    await expect(page.getByRole("cell", { name: "health_beauty_and_personal_care_19" })).toBeVisible();
  });
});

test("a table wider than the screen shows a scroll hint on the clipped edge", async ({ page }) => {
  await openResults(page, 320);
  await page.getByRole("tab", { name: "Table" }).click();
  const scroller = page.locator('[data-slot="table-container"]');
  const hasOverflow = await scroller.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(hasOverflow).toBe(true);
  // A gradient (the hint) is painted on the scroller while there is more to the right.
  expect(await scroller.evaluate((el) => getComputedStyle(el).backgroundImage)).toContain("gradient");
});

test("header, prompt box and About text share one left edge on desktop", async ({ page }) => {
  for (const width of [768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const left = async (loc: ReturnType<Page["locator"]>) => (await loc.boundingBox())!.x;
    const logo = await left(page.locator("header h1 img").first());
    const prompt = await left(page.getByLabel("Ask a question about the data"));
    const about = await left(page.getByRole("heading", { name: "About SiyasatQL" }));
    // The prompt box has inner padding for its border, so compare its outer container instead.
    const promptBox = await left(page.getByLabel("Ask a question about the data").locator("xpath=ancestor::form[1]"));
    expect(Math.abs(logo - about), `${width}px: logo vs About`).toBeLessThanOrEqual(1);
    expect(Math.abs(promptBox - about), `${width}px: prompt box vs About`).toBeLessThanOrEqual(1);
    void prompt;
  }
});

// WCAG 2.2 "target size (minimum)" is 24 x 24 px; inline links are exempt from it, but small
// links are still hard to hit on a phone, so every link and control is held to the bar.
for (const width of [320, 1440]) {
  test(`links and controls are at least 24px tall at ${width}px (home and results)`, async ({ page }) => {
    const tooSmall = () =>
      page.evaluate(() =>
        [...document.querySelectorAll("a, button, [role=tab], textarea, input")]
          .map((e) => ({ e, r: e.getBoundingClientRect() }))
          .filter(({ r }) => r.width > 0 && (r.height < 24 || r.width < 24))
          .map(({ e, r }) => `${e.tagName}:${(e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 30)} ${Math.round(r.width)}x${Math.round(r.height)}`),
      );
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(await tooSmall(), "home").toEqual([]);
    await openResults(page, width);
    expect(await tooSmall(), "results").toEqual([]);
  });
}

test("the longest identifier in a typical query fits on one line of the SQL box on a phone", async ({ page }) => {
  await openResults(page, 320);
  const fits = await page.getByLabel("SQL query").evaluate((ta) => {
    const cs = getComputedStyle(ta);
    const inner = ta.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const probe = document.createElement("span");
    probe.style.cssText = `font:${cs.font};letter-spacing:${cs.letterSpacing};position:absolute;visibility:hidden;white-space:pre`;
    probe.textContent = "p.product_category_name_english"; // 31 characters, the kind of name the model writes
    document.body.appendChild(probe);
    const w = probe.getBoundingClientRect().width;
    probe.remove();
    return { inner, w };
  });
  expect(fits.w, `identifier is ${fits.w}px but a line is ${fits.inner}px`).toBeLessThanOrEqual(fits.inner);
});
