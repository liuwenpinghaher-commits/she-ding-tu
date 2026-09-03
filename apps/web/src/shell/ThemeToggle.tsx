import { useEffect, useState } from "react";
import { readThemeFromDom, THEME_EVENT, toggleTheme, type Theme } from "./theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readThemeFromDom);
  useEffect(() => {
    const on = (e: Event) => {
      const next = (e as CustomEvent<Theme>).detail;
      setTheme(next === "light" || next === "dark" ? next : readThemeFromDom());
    };
    window.addEventListener(THEME_EVENT, on);
    return () => window.removeEventListener(THEME_EVENT, on);
  }, []);
  const light = theme === "light";
  return (
    <button
      type="button"
      className="theme-toggle"
      data-testid="theme-toggle"
      aria-pressed={light ? "true" : "false"}
      aria-label={light ? "切到暗色主题" : "切到亮色主题"}
      onClick={() => setTheme(toggleTheme())}
    >
      {light ? (
        <svg data-testid="theme-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path fill="currentColor" d="M13.2 10.1A6.2 6.2 0 0 1 5.9 2.8 6.5 6.5 0 1 0 13.2 10.1z" />
        </svg>
      ) : (
        <svg data-testid="theme-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="2.6" fill="currentColor" />
          <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
            <path d="M8 1.5v1.8M8 12.7v1.8M1.5 8h1.8M12.7 8h1.8M3.4 3.4l1.3 1.3M11.3 11.3l1.3 1.3M3.4 12.6l1.3-1.3M11.3 4.7l1.3-1.3" />
          </g>
        </svg>
      )}
    </button>
  );
}
