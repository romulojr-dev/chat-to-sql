export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "theme";

/** A saved choice wins; otherwise follow the system setting. */
export function resolveTheme(stored: string | null, systemPrefersDark: boolean): Theme {
  if (stored === "light" || stored === "dark") return stored;
  return systemPrefersDark ? "dark" : "light";
}

/**
 * Runs synchronously in <head> so the right theme is on <html> before first paint
 * (see node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md).
 * It is plain ES5 and mirrors `resolveTheme`; tests/theme.test.ts runs it against a fake browser.
 */
export const THEME_INIT_SCRIPT = `(function(){var s=null;try{s=localStorage.getItem("${THEME_STORAGE_KEY}")}catch(e){}var d=s==="dark"||(s!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)})()`;
