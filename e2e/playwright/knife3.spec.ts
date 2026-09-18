import { expect } from "@playwright/test";
import { test, waitBookLabel } from "./helpers";

test.describe.configure({ timeout: 120000 });

test("K3 账本人话空态", async ({ page }) => {
  const book = "k3-ledger-" + Date.now();
  await page.goto("/");
  await page.getByTestId("book-name").fill(book);
  await page.getByTestId("create-book").click();
  await waitBookLabel(page, book);
  await expect(page.getByTestId("sit-world")).toContainText("此刻还开着的事");
  await expect(page.getByTestId("sit-world")).toContainText("此刻没有开着的账");
  await expect(page.getByTestId("sit-people")).toContainText("谁知道、谁不知道、谁信错");
  await expect(page.getByTestId("sit-reader")).toContainText("你看见了、场上有人还不知道");
  await expect(page.getByTestId("sit-shift")).toContainText("这场前后，什么变了");
  await expect(page.getByTestId("sit-shift")).toContainText("还没写变化");
  await expect(page.getByTestId("sit-blocks")).not.toContainText("世界账");
  await expect(page.getByTestId("sit-blocks")).not.toContainText("人物账");
  await expect(page.getByTestId("sit-blocks")).not.toContainText("读者账");
  await expect(page.getByTestId("sit-blocks")).not.toContainText("未写转折");
});

test("K3 未名场标题用这场要办成什么", async ({ page }) => {
  const book = "k3-title-" + Date.now();
  await page.goto("/");
  await page.getByTestId("book-name").fill(book);
  await page.getByTestId("create-book").click();
  await waitBookLabel(page, book);
  await page.getByTestId("intent").fill("把信交出去");
  await page.getByTestId("write-next").click();
  const card = page.locator(".card.draft").first();
  await expect(card).toBeVisible();
  await expect(page.getByTestId("card-title")).toHaveText("把信交出去");
  await expect(page.getByTestId("stripboard")).not.toContainText("未名场");
});

test("K3 假模型填场按钮文案", async ({ page }) => {
  const book = "k3-fill-" + Date.now();
  await page.goto("/");
  await page.getByTestId("book-name").fill(book);
  await page.getByTestId("create-book").click();
  await waitBookLabel(page, book);
  await page.getByTestId("intent").fill("阿福发现刀");
  await page.getByTestId("write-next").click();
  await expect(page.locator(".card.draft").first()).toBeVisible();
  await expect(page.getByTestId("fill-live")).toHaveText("模型填这一场");
  await expect(page.getByTestId("fill-fake")).toBeAttached();
  await expect(page.locator("body")).not.toContainText("假模型填场");
});

test("K3 写入正史解释语", async ({ page }) => {
  const book = "k3-commit-" + Date.now();
  await page.goto("/");
  await page.getByTestId("book-name").fill(book);
  await page.getByTestId("create-book").click();
  await waitBookLabel(page, book);
  await expect(page.getByTestId("commit")).toHaveText("写入正史");
  await expect(page.getByTestId("commit-explain")).toHaveText("定稿，后面的场会用到");
  await page.getByTestId("intent").fill("阿福发现刀");
  await page.getByTestId("write-next").click();
  await page.locator(".card.draft").first().click();
  await page.getByTestId("fill-fake").click({ force: true });
  await expect(page.getByTestId("write-box")).toHaveText("写入此框（仍是草稿）");
  await expect(page.getByTestId("thread-unlined")).toContainText("可以不贴");
  await expect(page.getByTestId("scene-threads")).toContainText("还没贴到某一条故事线（可以不贴）");
});
