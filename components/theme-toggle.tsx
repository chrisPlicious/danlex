"use client";

import { useLayoutEffect } from "react";
import { applyTheme, preferredTheme, saveTheme } from "@/lib/theme";

/** Shows the theme it switches to. Which icon shows comes from CSS, so server and client markup always match. */
export function ThemeToggle() {
  // React's dev-only Strict Mode remount clears the attribute the <head> script set. No effect in production.
  useLayoutEffect(() => applyTheme(preferredTheme()), []);

  function toggle() {
    const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    applyTheme(next);
    saveTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Switch between light and dark mode"
      title="Switch between light and dark mode"
      className="grid size-8 shrink-0 place-items-center min-[360px]:size-9 rounded-md text-ink transition hover:text-fg"
    >
      <svg viewBox="0 0 24 24" className="size-5 light:hidden" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
      <svg viewBox="0 0 24 24" className="hidden size-5 light:block" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
      </svg>
    </button>
  );
}
