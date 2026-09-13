import { expect } from "@playwright/test";
import { test, openStripboard, waitBookLabel } from "./helpers";

test.describe.configure({ timeout: 120000 });

test("K2 写下一场后出现 toast", async ({ page }) => {
  const book = "k2-toast-" + Date.now();
  await page.goto("/");
  await page.getByTestId("book-name").fill(book);
  await page.getByTestId("create-book").click();
  await waitBookLabel(page, book);
  await page.getByTestId("intent").fill("把信交出去");
  await page.getByTestId("write-next").click();
  await expect(page.locator(".card.draft").first()).toBeVisible();
  await expect(page.getByTestId("undo-toast")).toBeVisible();
  await expect(page.getByTestId("undo-toast")).toContainText("已插一场草稿");
});

test("K2 模型填场到达后有未定稿角标", async ({ page }) => {
  const book = "k2-badge-" + Date.now();
  await page.goto("/");
  await page.getByTestId("book-name").fill(book);
  await page.getByTestId("create-book").click();
  await waitBookLabel(page, book);
  await page.getByTestId("intent").fill("阿福发现刀");
  await page.getByTestId("write-next").click();
  await expect(page.locator(".card.draft").first()).toBeVisible();
  await expect(page.getByTestId("write-next")).toHaveAttribute("aria-busy", "false");
  await expect(page.getByTestId("commit")).toBeEnabled();
  const filled = page.waitForResponse((res) => res.url().includes("/api/fill-fake") && res.request().method() === "POST");
  await page.getByTestId("fill-fake").click({ force: true });
  await filled;
  await expect(page.getByTestId("discuss-panel")).toBeVisible();
  await expect(page.getByTestId("model-suggest-badge")).toBeVisible();
  await expect(page.getByTestId("model-suggest-badge")).toHaveText("模型建议，未定稿");
  await expect.poll(async () => {
    const st = await page.evaluate(async () => (await (await fetch("/api/state")).json()));
    return (st.committed || []).length;
  }).toBe(0);
});

test("K2 右栏空态用人话占位", async ({ page }) => {
  const book = "k2-empty-" + Date.now();
  await page.goto("/");
  await page.getByTestId("book-name").fill(book);
  await page.getByTestId("create-book").click();
  await waitBookLabel(page, book);
  await expect(page.getByTestId("sit-world")).toContainText("此刻没有开着的账");
  await expect(page.getByTestId("sit-people")).toContainText("还没写谁知道什么");
  await expect(page.getByTestId("sit-reader")).toContainText("这场没有读者比角色多知道的事");
  await expect(page.getByTestId("sit-shift")).toContainText("还没写变化");
  await expect(page.getByTestId("sit-world")).not.toContainText("未写转折");
  await page.getByTestId("intent").fill("阿福发现刀");
  await page.getByTestId("write-next").click();
  await page.locator(".card.draft").first().click();
  await page.getByTestId("do-text").fill("打开抽屉");
  await page.getByTestId("commit").click();
  await page.locator(".card.canon").first().waitFor({ timeout: 15000 });
  await expect(page.getByTestId("unwritten-shift")).toHaveText("还没写变化");
  await expect(page.getByTestId("unwritten-shift")).not.toHaveText("未写转折");
});

test("K2 删已正史确认框列出缺口与影响", async ({ page }) => {
  const book = "k2-impact-" + Date.now();
  await page.goto("/");
  await page.getByTestId("book-name").fill(book);
  await page.getByTestId("create-book").click();
  await waitBookLabel(page, book);
  await openStripboard(page);
  await page.getByTestId("density-mid").click();
  await expect(page.getByTestId("col-count")).toHaveText("4");
  await page.getByTestId("intent").fill("把信交出去");
  await page.getByTestId("write-next").click();
  await page.locator(".card.draft").first().click();
  await page.getByTestId("do-text").fill("交信。");
  await page.getByTestId("commit").click();
  await expect.poll(async () => {
    const st = await page.evaluate(async () => (await (await fetch("/api/state")).json()));
    return (st.committed || []).length;
  }, { timeout: 20000 }).toBe(1);
  const st = await page.evaluate(async () => (await (await fetch("/api/state")).json()));
  const b1 = (st.committed || []).find((b: { intent: string }) => b.intent.includes("把信交出去"));
  await page.getByTestId("intent").fill("因为交信船要开");
  await page.getByTestId("write-next").click();
  await page.locator(".card.draft").first().click();
  await page.getByTestId("cause-beat").fill(b1.id);
  await page.getByTestId("do-text").fill("号子。");
  await page.getByTestId("commit").click();
  await expect.poll(async () => {
    const s2 = await page.evaluate(async () => (await (await fetch("/api/state")).json()));
    return (s2.committed || []).length;
  }, { timeout: 20000 }).toBe(2);
  await page.getByTestId("tooth-0").click();
  const card = page.locator(`[data-testid="card-${b1.id}"]`);
  if (!(await card.isVisible().catch(() => false))) {
    await page.getByTestId("density-dense").click();
  }
  await card.click();
  await page.getByTestId("delete-canon").click();
  await expect(page.getByTestId("confirm-change")).toBeVisible();
  const impacts = page.getByTestId("impact-list");
  await expect(impacts).toBeVisible();
  expect(await impacts.locator("li").count()).toBeGreaterThan(0);
  await expect(impacts).toContainText("因果");
  await expect(impacts).toContainText("因为交信");
  await page.getByTestId("confirm-cancel").click();
  await expect(page.getByTestId("confirm-change")).toBeHidden();
});

test("K2 写入正史后可回看第几次写入，失败有原因", async ({ page }) => {
  const book = "k2-seq-" + Date.now();
  await page.goto("/");
  await page.getByTestId("book-name").fill(book);
  await page.getByTestId("create-book").click();
  await waitBookLabel(page, book);
  await page.getByTestId("intent").fill("阿福发现刀");
  await page.getByTestId("write-next").click();
  await page.locator(".card.draft").first().click();
  await page.getByTestId("do-text").fill("打开抽屉看见刀");
  await page.route("**/api/commit", async (route) => {
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ message: "穿帮：刀还在抽屉" }),
    });
  });
  await page.getByTestId("commit").click();
  await expect(page.getByTestId("op-error")).toContainText("穿帮");
  await expect(page.getByTestId("undo-toast")).toContainText("穿帮");
  await page.unroute("**/api/commit");
  await page.getByTestId("commit").click();
  await page.locator(".card.canon").first().waitFor({ timeout: 15000 });
  await expect(page.getByTestId("undo-toast")).toContainText("已写入正史");
  await page.locator(".card.canon").first().click();
  await expect(page.getByTestId("commit-seq")).toContainText("第 1 次写入正史");
});

test("K2 删书确认框列出缺口与影响", async ({ page }) => {
  const book = "k2-delbook-" + Date.now();
  await page.goto("/");
  await page.getByTestId("book-name").fill(book);
  await page.getByTestId("create-book").click();
  await waitBookLabel(page, book);
  await page.getByTestId("intent").fill("还没定的一场");
  await page.getByTestId("write-next").click();
  await expect(page.locator(".card.draft").first()).toBeVisible();
  await page.getByTestId("open-shelf").click();
  await expect(page.getByTestId("shelf")).toBeVisible();
  const delBtn = page.getByTestId(`shelf-del-${book}`);
  await delBtn.evaluate((el) => {
    const details = el.closest("details");
    if (details) details.open = true;
  });
  await delBtn.click();
  await expect(page.getByTestId("del-book")).toBeVisible();
  const impacts = page.getByTestId("del-book-impacts");
  await expect(impacts).toBeVisible();
  expect(await impacts.locator("li").count()).toBeGreaterThan(0);
  await expect(impacts).toContainText("不能撤销");
  await expect(impacts).toContainText("草稿");
});
