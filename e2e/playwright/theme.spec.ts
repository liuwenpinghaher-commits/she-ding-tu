import { expect } from "@playwright/test";
import { test } from "./helpers";

test.describe.configure({ timeout: 60000 });

test("默认亮色，顶栏可切暗色并记住", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const btn = page.getByTestId("theme-toggle");
  await expect(btn).toHaveAttribute("aria-label", "切到暗色主题");
  await expect(btn).toHaveAttribute("aria-pressed", "true");
  await btn.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(btn).toHaveAttribute("aria-pressed", "false");
  await expect(btn).toHaveAttribute("aria-label", "切到亮色主题");
  expect(await page.evaluate(() => localStorage.getItem("setting-theme"))).toBe("dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("地址栏 theme=light 盖过本地暗色记忆", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("setting-theme", "dark"));
  await page.goto("/?theme=light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("命令面板能搜到切换主题", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("open-cmd").click();
  await page.getByTestId("cmd-q").fill("暗色");
  await expect(page.getByTestId("cmd-palette")).toContainText("切到暗色");
  await page.getByTestId("cmd-active").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
