export type Theme = "light" | "dark";

export const THEME_KEY = "setting-theme";
export const THEME_KEY_LEGACY = "worldgraph-theme";
export const THEME_EVENT = "setting-theme";

export function resolveTheme(
  search: string,
  stored: string | null,
  legacyStored: string | null = null,
): Theme {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const q = new URLSearchParams(raw).get("theme");
  if (q === "light" || q === "dark") return q;
  if (stored === "light" || stored === "dark") return stored;
  if (legacyStored === "light" || legacyStored === "dark") return legacyStored;
  return "light";
}

export function nextTheme(current: Theme): Theme {
  return current === "light" ? "dark" : "light";
}

export function applyTheme(
  theme: Theme,
  root: Pick<HTMLElement, "setAttribute"> | null = typeof document === "undefined" ? null : document.documentElement,
): Theme {
  root?.setAttribute("data-theme", theme);
  return theme;
}

export function persistTheme(
  theme: Theme,
  storage: Pick<Storage, "setItem"> | null = typeof localStorage === "undefined" ? null : localStorage,
): void {
  try {
    storage?.setItem(THEME_KEY, theme);
  } catch {
    /* 无痕窗口 */
  }
}

export function readThemeFromDom(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

export function setTheme(theme: Theme): Theme {
  applyTheme(theme);
  persistTheme(theme);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: theme }));
  }
  return theme;
}

export function toggleTheme(): Theme {
  return setTheme(nextTheme(readThemeFromDom()));
}

export function bootTheme(
  search: string = typeof location === "undefined" ? "" : location.search,
  storage: Pick<Storage, "getItem"> | null = typeof localStorage === "undefined" ? null : localStorage,
): Theme {
  let stored: string | null = null;
  let legacy: string | null = null;
  try {
    stored = storage?.getItem(THEME_KEY) ?? null;
    legacy = storage?.getItem(THEME_KEY_LEGACY) ?? null;
  } catch {
    /* 无痕窗口 */
  }
  return applyTheme(resolveTheme(search, stored, legacy));
}
