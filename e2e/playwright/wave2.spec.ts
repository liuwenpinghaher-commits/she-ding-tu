import { test, expect } from "@playwright/test";

test("2.1 创建书进入分场条 N=1", async ({ page }) => {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto("/");
  await page.getByTestId("book-name").fill("渡口书");
  await page.getByTestId("create-book").click();
  await expect(page.getByTestId("book-label")).toHaveText("渡口书");
  await expect(page.getByTestId("col-count")).toHaveText("1");
  await expect(page.getByTestId("stripboard")).toBeVisible();
  expect(errs).toEqual([]);
});

test("2.2 新建设定身份层", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("book-name").fill("渡口书2");
  await page.getByTestId("create-book").click();
  await page.getByTestId("ent-name").fill("阿禾");
  await page.getByTestId("new-entity").click();
  await expect(page.getByTestId("ent-list")).toContainText("阿禾");
});

test("2.4 本页列数 1-6", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("book-name").fill("列数书");
  await page.getByTestId("create-book").click();
  await page.getByTestId("density-dense").click();
  await expect(page.getByTestId("col-count")).toHaveText("6");
  await expect(page.getByTestId("plus")).toBeDisabled();
  await page.getByTestId("density-sparse").click();
  await expect(page.getByTestId("col-count")).toHaveText("2");
  await page.getByTestId("minus").click();
  await expect(page.getByTestId("col-count")).toHaveText("1");
  await expect(page.getByTestId("minus")).toBeDisabled();
});

test("3.1 写入此框仍是草稿；3.2 写入正史", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("book-name").fill("正史书");
  await page.getByTestId("create-book").click();
  await page.getByTestId("intent").fill("阿福发现刀");
  await page.getByTestId("write-next").click();
  await page.getByTestId("talk").click();
  await page.getByTestId("write-box").click();
  await expect(page.locator(".card.draft")).toHaveCount(1);
  const world = await page.request.get("/api/world?t=0");
  const j = await world.json();
  expect(j.playing || []).toEqual([]);
  await page.getByTestId("commit").click();
  await expect(page.locator(".card.canon")).toHaveCount(1, { timeout: 10000 });
});
