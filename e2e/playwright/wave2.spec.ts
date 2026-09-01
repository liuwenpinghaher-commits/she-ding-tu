import { expect } from "@playwright/test";
import { test } from "./helpers";

test("2.1 创建书进入分场条 N=1", async ({ page }) => {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  const book = "渡口书-" + Date.now();
  await page.goto("/");
  await page.getByTestId("book-name").fill(book);
  await page.getByTestId("create-book").click();
  await expect(page.getByTestId("book-label")).toHaveText(book);
  await expect(page.getByTestId("col-count")).toHaveText("1");
  await expect(page.getByTestId("stripboard")).toBeVisible();
  expect(errs).toEqual([]);
});

test("2.2 新建设定身份层", async ({ page }) => {
  const book = "渡口书2-" + Date.now();
  await page.goto("/");
  await page.getByTestId("book-name").fill(book);
  await page.getByTestId("create-book").click();
  await expect(page.getByTestId("book-label")).toHaveText(book);
  await page.getByTestId("ent-name").fill("阿禾");
  await page.getByTestId("new-entity").click();
  await expect(page.getByTestId("ent-list")).toContainText("阿禾");
});

test("2.4 本页列数 1-6", async ({ page }) => {
  const book = "列数书-" + Date.now();
  await page.goto("/");
  await page.getByTestId("book-name").fill(book);
  await page.getByTestId("create-book").click();
  await expect(page.getByTestId("book-label")).toHaveText(book);
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
  const book = "正史书-" + Date.now();
  await page.goto("/");
  await page.getByTestId("book-name").fill(book);
  await page.getByTestId("create-book").click();
  await expect(page.getByTestId("book-label")).toHaveText(book);
  await page.getByTestId("intent").fill("阿福发现刀");
  await page.getByTestId("write-next").click();
  await page.locator(".card.draft").first().waitFor();
  await page.locator(".card.draft").first().click();
  await page.getByTestId("talk").click();
  await page.getByTestId("write-box").click();
  await expect(page.locator(".card.draft")).toHaveCount(1);
  const world = await page.request.get("/api/world?t=0");
  const j = await world.json();
  expect(j.playing || []).toEqual([]);
  await page.getByTestId("do-text").fill("阿福打开抽屉");
  await page.getByTestId("commit").click();
  await expect.poll(async () => {
    const st = await page.evaluate(async () => (await (await fetch("/api/state")).json()));
    return (st.committed || []).length;
  }, { timeout: 15000 }).toBe(1);
});
