import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { json, stubApi, SUGGESTION } from "./stubs";

// WCAG 2.0 / 2.1 level A and AA rules.
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function open(page: Page) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
}

async function violations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return results.violations.map((v) => ({
    rule: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.slice(0, 3).map((n) => n.target.join(" ")),
  }));
}

const THEMES = ["light", "dark"] as const;
const EXAMPLE = "How many unique customers do we have?";
const unsafe = (route: import("@playwright/test").Route) =>
  json({ error: { code: "unsafe_sql", message: "The assistant suggested a query that isn't allowed." } }, 422)(route);
const cannotAnswer = (route: import("@playwright/test").Route) =>
  json({ error: { code: "cannot_answer", message: "That is not in this data." } }, 422)(route);

// With nothing saved the page follows the system setting, so emulating it exercises both themes.
for (const theme of THEMES) {
  test.describe(`automated WCAG checks (axe-core), ${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
    });

    test("landing view", async ({ page }) => {
      await stubApi(page);
      await open(page);
      expect(await violations(page)).toEqual([]);
    });

    test("while the agent is working (Trace running and pending)", async ({ page }) => {
      await stubApi(page, {
        suggest: async (route) => {
          await new Promise((r) => setTimeout(r, 1500));
          await json(SUGGESTION)(route);
        },
      });
      await open(page);
      await page.getByRole("button", { name: EXAMPLE }).click();
      await expect(page.locator('[data-slot="trace-line"][data-status="pending"]')).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });

    test("after a suggestion", async ({ page }) => {
      await stubApi(page);
      await open(page);
      await page.getByRole("button", { name: EXAMPLE }).click();
      await expect(page.getByLabel("SQL query")).toHaveValue(SUGGESTION.sql);
      expect(await violations(page)).toEqual([]);
    });

    test("results as a chart, with the no-replies note", async ({ page }) => {
      await stubApi(page);
      await open(page);
      await page.getByRole("button", { name: EXAMPLE }).click();
      await page.getByRole("button", { name: "Run query" }).click();
      await expect(page.getByRole("img", { name: /Bar chart/ })).toBeVisible();
      await expect(page.getByRole("button", { name: "Back to homepage" })).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });

    test("results as a table", async ({ page }) => {
      await stubApi(page);
      await open(page);
      await page.getByRole("button", { name: EXAMPLE }).click();
      await page.getByRole("button", { name: "Run query" }).click();
      await page.getByRole("tab", { name: "Table" }).click();
      await expect(page.getByRole("table")).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });

    test("an error message with a failed Trace step", async ({ page }) => {
      await stubApi(page, { suggest: cannotAnswer });
      await open(page);
      await page.getByLabel("Ask a question about the data").fill("weather?");
      await page.getByRole("button", { name: "Suggest SQL" }).click();
      await expect(page.locator('[data-slot="alert"]')).toBeVisible();
      await expect(page.locator('[data-slot="trace-line"][data-status="error"]')).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });

    test("a blocked (unsafe) query", async ({ page }) => {
      await stubApi(page, { suggest: unsafe });
      await open(page);
      await page.getByRole("button", { name: EXAMPLE }).click();
      await expect(page.locator('[data-slot="trace-line"][data-status="error"]')).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });
  });
}

test.describe("keyboard and screen-reader structure", () => {
  test("tab order follows the visual order in the chat view: SQL, Run, the results tabs, then Back to homepage", async ({ page }) => {
    await stubApi(page);
    await open(page);
    await page.getByRole("button", { name: EXAMPLE }).click();
    await page.getByRole("button", { name: "Run query" }).click();
    await expect(page.getByRole("tab", { name: "Chart" })).toBeVisible();

    // Start in the SQL box, then Tab through the rest of the page.
    await page.getByLabel("SQL query").focus();
    const names: string[] = [];
    for (let i = 0; i < 6; i++) {
      names.push(
        await page.evaluate(() => {
          const el = document.activeElement as (HTMLElement & { labels?: NodeListOf<HTMLLabelElement> }) | null;
          return el?.getAttribute("aria-label") ?? el?.labels?.[0]?.textContent?.trim() ?? el?.textContent?.trim() ?? "";
        }),
      );
      await page.keyboard.press("Tab");
    }
    const at = (name: string) => names.findIndex((n) => n === name);

    expect(names[0]).toBe("SQL query");
    // "Table" is not a Tab stop: tabs use arrow keys (roving tabindex), checked below.
    const order = [at("SQL query"), at("Run query"), at("Chart"), at("Back to homepage")];
    expect(order.every((i) => i >= 0), `all stops reached: ${JSON.stringify(names)}`).toBe(true);
    expect(order, `focus order: ${JSON.stringify(names)}`).toEqual([...order].sort((x, y) => x - y));
    expect(at("Table"), "inactive tabs are reached with arrow keys, not Tab").toBe(-1);
  });

  test("the results tabs work from the keyboard: arrows move focus, Enter selects (manual activation)", async ({ page }) => {
    await stubApi(page);
    await open(page);
    await page.getByRole("button", { name: EXAMPLE }).click();
    await page.getByRole("button", { name: "Run query" }).click();

    const chartTab = page.getByRole("tab", { name: "Chart" });
    const tableTab = page.getByRole("tab", { name: "Table" });
    await chartTab.focus();

    await page.keyboard.press("ArrowRight");
    await expect(tableTab).toBeFocused();
    await expect(tableTab).toHaveAttribute("aria-selected", "false"); // focus alone does not switch the view

    await page.keyboard.press("Enter");
    await expect(tableTab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("table")).toBeVisible();

    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Space");
    await expect(chartTab).toHaveAttribute("aria-selected", "true");
  });

  test("every control has an accessible name, and the page has one h1", async ({ page }) => {
    await stubApi(page);
    await open(page);
    await page.getByRole("button", { name: EXAMPLE }).click();
    await page.getByRole("button", { name: "Run query" }).click();
    await expect(page.getByRole("img", { name: /Bar chart/ })).toBeVisible();

    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    const unnamed = await page.evaluate(() =>
      [...document.querySelectorAll("button, [role=tab], textarea, input, a")]
        .filter((el) => {
          const e = el as HTMLElement;
          const name = e.getAttribute("aria-label") || e.getAttribute("aria-labelledby") || (e as HTMLInputElement).labels?.length || e.textContent?.trim();
          return !name;
        })
        .map((el) => el.outerHTML.slice(0, 80)),
    );
    expect(unnamed).toEqual([]);
  });

  test("the chart has a text alternative that points to the table", async ({ page }) => {
    await stubApi(page);
    await open(page);
    await page.getByRole("button", { name: EXAMPLE }).click();
    await page.getByRole("button", { name: "Run query" }).click();

    const chart = page.getByRole("img", { name: /Bar chart of orders by order_status, 3 points/ });
    await expect(chart).toBeVisible();
    await expect(chart).toHaveAttribute("aria-label", /The same data is in the Table tab/);
  });

  test("progress and results are announced to assistive technology", async ({ page }) => {
    await stubApi(page);
    await open(page);
    // Results and errors sit inside polite live regions.
    await page.getByRole("button", { name: EXAMPLE }).click();
    await page.getByRole("button", { name: "Run query" }).click();
    await expect(page.locator('section[aria-live="polite"]').filter({ has: page.getByRole("tab") })).toHaveCount(1);
  });
});

test.describe("visual regressions that automated WCAG checks cannot see", () => {
  test("the page renders in the app's own font, not the browser default", async ({ page }) => {
    await stubApi(page);
    await open(page);
    const family = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(family).toMatch(/geist/i);
  });

  for (const theme of THEMES) test(`chart marks have at least 3:1 contrast against the background (WCAG 1.4.11), ${theme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await stubApi(page);
    await open(page);
    await page.getByRole("button", { name: EXAMPLE }).click();
    await page.getByRole("button", { name: "Run query" }).click();
    await expect(page.locator(".recharts-bar-rectangle path").first()).toBeVisible();

    const ratio = await page.evaluate(() => {
      // Resolve any CSS color (including oklch) to sRGB by painting it on a canvas pixel.
      const rgb = (css: string) => {
        const c = document.createElement("canvas");
        c.width = c.height = 1;
        const ctx = c.getContext("2d")!;
        ctx.fillStyle = css;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        return [r, g, b];
      };
      const lum = ([r, g, b]: number[]) => {
        const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const bar = document.querySelector(".recharts-bar-rectangle path") as SVGElement;
      const fg = rgb(getComputedStyle(bar).fill);
      const bg = rgb(getComputedStyle(document.body).backgroundColor);
      const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a);
      return (hi + 0.05) / (lo + 0.05);
    });
    expect(ratio).toBeGreaterThanOrEqual(3);
  });
});
