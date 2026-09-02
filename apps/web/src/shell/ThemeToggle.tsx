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
    >{light ? "暗色" : "亮色"}</button>
  );
}
