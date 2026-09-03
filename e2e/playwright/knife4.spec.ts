import { expect } from "@playwright/test";
import { test } from "./helpers";

test.describe.configure({ timeout: 120000 });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.removeItem("sdt-guide-v1"); } catch { /* ignore */ }
  });
});

test("K4 引导可启动并显示首步气泡", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("guide-start").click();
  await expect(page.getByTestId("guide-bubble")).toBeVisible();
  await expect(page.getByTestId("guide-step")).toContainText("G0");
  await expect(page.getByTestId("guide-bubble")).toContainText("这是你的书单");
  await expect(page.getByTestId("guide-skip")).toBeVisible();
  await expect(page.getByTestId("guide-next")).toBeVisible();
});

test("K4 下一步上一步推进", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("guide-start").click();
  await expect(page.getByTestId("guide-step")).toContainText("G0");
  await page.getByTestId("guide-next").click();
  await expect(page.getByTestId("guide-step")).toContainText("G1");
  await expect(page.getByTestId("guide-bubble")).toContainText("先起个书名");
  await page.getByTestId("guide-prev").click();
  await expect(page.getByTestId("guide-step")).toContainText("G0");
  await expect(page.getByTestId("guide-bubble")).toContainText("这是你的书单");
});

test("K4 跳过立即回自由操作", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("guide-start").click();
  await expect(page.getByTestId("guide-bubble")).toBeVisible();
  await page.getByTestId("guide-skip").click();
  await expect(page.getByTestId("guide-bubble")).toHaveCount(0);
  await page.getByTestId("shelf-new").click();
  await expect(page.getByTestId("nb-name")).toBeVisible();
  await expect(page.getByTestId("nb-name")).toBeEditable();
  await expect(page.getByTestId("guide-bubble")).toHaveCount(0);
});

test("K4 不挡正常操作", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("guide-start").click();
  await expect(page.getByTestId("guide-bubble")).toBeVisible();
  await page.getByTestId("shelf-new").click();
  await expect(page.getByTestId("nb-name")).toBeVisible();
  const book = "k4-free-" + Date.now();
  await page.getByTestId("nb-name").fill(book);
  await expect(page.getByTestId("nb-create")).toBeEnabled();
  await expect(page.getByTestId("guide-bubble")).toBeVisible();
  await expect(page.getByTestId("guide-step")).toContainText("G1");
});

test("K4 可重看", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("guide-start").click();
  await page.getByTestId("guide-skip").click();
  await expect(page.getByTestId("guide-bubble")).toHaveCount(0);
  await page.getByTestId("guide-start").click();
  await expect(page.getByTestId("guide-bubble")).toBeVisible();
  await expect(page.getByTestId("guide-step")).toContainText("G0");
  await expect(page.getByTestId("guide-bubble")).toContainText("这是你的书单");
});
