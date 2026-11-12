"use client";

import { useLayoutEffect, useRef } from "react";
import { MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { THEME_STORAGE_KEY, resolveTheme } from "@/lib/theme";

function readStored(): string | null {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

function systemPrefersDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeToggle() {
  // React Strict Mode can clear the class the inline script set during the dev remount; re-apply it.
  // This is a no-op in production.
  useLayoutEffect(() => {
    const theme = resolveTheme(readStored(), systemPrefersDark());
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, []);

  const buttonRef = useRef<HTMLButtonElement>(null);

  function save(next: "light" | "dark") {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage blocked: the choice still applies for this visit.
    }
  }

  function apply(next: "light" | "dark") {
    document.documentElement.classList.toggle("dark", next === "dark");
  }

  function toggle() {
    const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
    save(next);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const button = buttonRef.current;
    if (!document.startViewTransition || reduceMotion || !button) {
      apply(next);
      return;
    }

    // Reveal the new theme as a circle growing from the button.
    const { left, top, width, height } = button.getBoundingClientRect();
    const x = left + width / 2;
    const y = top + height / 2;
    const radius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );
    const transition = document.startViewTransition(() => apply(next));
    transition.ready
      .then(() => {
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          { duration: 600, easing: "ease-in-out", pseudoElement: "::view-transition-new(root)" },
        );
      })
      .catch(() => {});
  }

  // Both icons are always rendered and CSS picks one, so the server HTML matches the client.
  return (
    <Button ref={buttonRef} variant="ghost" size="icon" onClick={toggle} aria-label="Toggle dark mode">
      <MoonIcon className="dark:hidden" />
      <SunIcon className="hidden dark:block" />
    </Button>
  );
}
