export type Theme = "light" | "dark";

const STORAGE_KEY = "theme";

/**
 * Runs in <head> before the first paint so the page never flashes the wrong theme.
 * Same logic as preferredTheme below, which React can't reuse here because this has to be a plain string.
 */
export const THEME_SCRIPT = `(function(){var t;try{t=localStorage.getItem("${STORAGE_KEY}")}catch(e){}if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";document.documentElement.setAttribute("data-theme",t)})()`;

/** The player's saved choice, or their device setting if they haven't picked one. */
export function preferredTheme(): Theme {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    // storage can be blocked, for example in some private windows
  }
  if (saved === "light" || saved === "dark") return saved;
  return matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

export function saveTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // the switch still works for this page view, it just won't be remembered
  }
}
