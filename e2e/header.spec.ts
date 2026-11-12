import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;

async function open(page: Page) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
}

const isDark = (page: Page) => page.evaluate(() => document.documentElement.classList.contains("dark"));

test.describe("header", () => {
  test("shows the name as text, with no logo image", async ({ page }) => {
    await open(page);
    const header = page.getByRole("banner");
    await expect(header.getByRole("heading", { name: "SiyasatQL" })).toBeVisible();
    await expect(header.getByRole("img")).toHaveCount(0);
  });

  test("has a theme toggle, a divider, then mail, GitHub and LinkedIn links", async ({ page }) => {
    await open(page);
    const header = page.getByRole("banner");

    await expect(header.getByRole("button", { name: "Toggle dark mode" })).toBeVisible();
    await expect(header.getByRole("separator")).toHaveCount(1);

    await expect(header.getByRole("link", { name: "Email" })).toHaveAttribute("href", "mailto:romu.dev@outlook.com");
    await expect(header.getByRole("link", { name: "GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/romulojr-dev/chat-to-sql",
    );
    await expect(header.getByRole("link", { name: "LinkedIn" })).toHaveAttribute(
      "href",
      "https://www.linkedin.com/in/romulo-dev/",
    );

    // External links open in a new tab without leaking the opener.
    for (const name of ["GitHub", "LinkedIn"]) {
      const link = header.getByRole("link", { name });
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", /noreferrer/);
    }
  });

  test("the four controls come in order: theme, mail, GitHub, LinkedIn", async ({ page }) => {
    await open(page);
    const labels = await page
      .getByRole("banner")
      .locator("button, a")
      .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
    expect(labels).toEqual(["Toggle dark mode", "Email", "GitHub", "LinkedIn"]);
  });

  test("the theme toggle switches modes and the choice survives a reload", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await open(page);
    expect(await isDark(page)).toBe(false);

    await page.getByRole("button", { name: "Toggle dark mode" }).click();
    // The switch runs inside a view transition, so the class lands a frame after the click.
    await expect.poll(() => isDark(page)).toBe(true);

    await page.reload();
    await page.waitForLoadState("networkidle");
    expect(await isDark(page)).toBe(true);

    await page.getByRole("button", { name: "Toggle dark mode" }).click();
    await expect.poll(() => isDark(page)).toBe(false);
    await page.reload();
    await page.waitForLoadState("networkidle");
    expect(await isDark(page)).toBe(false);
  });

  test("with nothing saved, the page follows the system setting", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await open(page);
    expect(await isDark(page)).toBe(true);
  });

  test("the saved theme is applied before first paint (no flash)", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("theme", "dark"));
    // Check at DOMContentLoaded, before React has hydrated: the inline script must already have run.
    await page.goto("/", { waitUntil: "commit" });
    await page.waitForFunction(() => document.documentElement.classList.contains("dark"), null, { timeout: 2000 });
  });
});
