import { describe, expect, it } from "vitest";
import { THEME_INIT_SCRIPT, THEME_STORAGE_KEY, resolveTheme } from "@/lib/theme";

describe("resolveTheme", () => {
  it("uses the saved choice when there is one", () => {
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });

  it("falls back to the system setting when nothing valid is saved", () => {
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme(null, false)).toBe("light");
    expect(resolveTheme("purple", true)).toBe("dark");
  });
});

/** Run the inline script against a fake browser to check what it does before first paint. */
function runInitScript(opts: { stored?: string | null; prefersDark?: boolean; storageThrows?: boolean }) {
  const classes = new Set<string>();
  const document = {
    documentElement: {
      classList: {
        toggle: (name: string, on: boolean) => void (on ? classes.add(name) : classes.delete(name)),
      },
    },
  };
  const localStorage = {
    getItem: (key: string) => {
      if (opts.storageThrows) throw new Error("blocked");
      expect(key).toBe(THEME_STORAGE_KEY);
      return opts.stored ?? null;
    },
  };
  const matchMedia = () => ({ matches: opts.prefersDark ?? false });
  new Function("document", "localStorage", "matchMedia", THEME_INIT_SCRIPT)(document, localStorage, matchMedia);
  return classes.has("dark");
}

describe("THEME_INIT_SCRIPT", () => {
  it("applies a saved dark choice even if the system is light", () => {
    expect(runInitScript({ stored: "dark", prefersDark: false })).toBe(true);
  });

  it("applies a saved light choice even if the system is dark", () => {
    expect(runInitScript({ stored: "light", prefersDark: true })).toBe(false);
  });

  it("follows the system when nothing is saved", () => {
    expect(runInitScript({ prefersDark: true })).toBe(true);
    expect(runInitScript({ prefersDark: false })).toBe(false);
  });

  it("does not throw when storage is blocked, and follows the system", () => {
    expect(runInitScript({ storageThrows: true, prefersDark: true })).toBe(true);
  });
});
