/**
 * F40 作家总闭环：纯点击。实现见 f40.click.mjs（本文件给 Playwright test runner）。
 * 禁止 page.request 写入正史。
 */
import { test, expect } from "@playwright/test";

test("F40 点击闭环", async ({ page }) => {
  const book = "f40-" + Date.now();
  await page.goto("/");
  await page.getByTestId("book-name").fill(book);
  await page.getByTestId("create-book").click();
  await expect(page.getByTestId("book-label")).toHaveText(book);
  await expect(page.getByTestId("column-0")).toBeVisible();
  await page.getByTestId("ent-name").fill("阿福");
  await page.getByTestId("new-entity").click();
  await page.getByTestId("intent").fill("阿福发现刀");
  await page.getByTestId("write-next").click();
  await expect(page.locator(".card.draft").first()).toBeVisible();
  await page.getByTestId("talk").click();
  await page.getByTestId("write-box").click();
  await page.locator('[data-testid="ent-阿福"]').dragTo(page.locator(".card.draft").first());
  await page.getByTestId("commit").click();
  await expect(page.locator(".card.canon").first()).toBeVisible({ timeout: 15000 });
});
