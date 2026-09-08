import { expect } from "@playwright/test";
import { clickOpsAction, openOpsMenu, test, waitBookLabel } from "./helpers";

test.describe.configure({ timeout: 120000 });

test("K1 新书默认落在分场条", async ({ page }) => {
  const book = "k1-default-" + Date.now();
  await page.goto("/");
  await page.getByTestId("book-name").fill(book);
  await page.getByTestId("create-book").click();
  await waitBookLabel(page, book);
  await expect(page.getByTestId("stripboard")).toBeVisible();
  await expect(page.getByTestId("timeline")).toHaveCount(0);
  await expect(page.getByTestId("tab-分场条")).toBeVisible();
  await expect(page.getByTestId("open-timeline")).toBeVisible();
  await expect(page.getByTestId("strip-empty")).toContainText("这场要办成什么");
  await page.getByTestId("open-timeline").click();
  await expect(page.getByTestId("timeline")).toBeVisible();
  await page.getByTestId("tab-分场条").click();
  await expect(page.getByTestId("stripboard")).toBeVisible();
});

test("K1 点写下一场后任务输入可见可打", async ({ page }) => {
  const book = "k1-compose-" + Date.now();
  await page.goto("/");
  await page.getByTestId("book-name").fill(book);
  await page.getByTestId("create-book").click();
  await waitBookLabel(page, book);
  await expect(page.getByTestId("scene-compose")).toBeVisible();
  const intentBox = await page.getByTestId("intent").boundingBox();
  expect(intentBox).toBeTruthy();
  expect(intentBox!.width).toBeGreaterThan(40);
  await page.getByTestId("intent").fill("把信交出去");
  await expect(page.getByTestId("write-next")).toBeEnabled();
  await page.getByTestId("write-next").click();
  await expect(page.locator(".card.draft").first()).toBeVisible();
  await expect(page.getByTestId("intent")).toBeVisible();
  await expect(page.getByTestId("intent")).toBeEditable();
  await expect(page.getByTestId("intent")).toHaveValue(/把信交出去/);
  await page.getByTestId("intent").fill("把信交出去，立刻");
  await expect(page.getByTestId("intent")).toHaveValue(/立刻/);
  await expect(page.getByTestId("place-id")).toBeVisible();
  await expect(page.getByTestId("place-id")).toBeEditable();
  await expect(page.getByTestId("compose-people")).toBeVisible();
  await expect(page.getByTestId("compose-hint")).toBeVisible();
});

test("K1 导出贴草稿伏笔命令常驻可见", async ({ page }) => {
  const book = "k1-icons-" + Date.now();
  await page.goto("/");
  await page.getByTestId("book-name").fill(book);
  await page.getByTestId("create-book").click();
  await waitBookLabel(page, book);
  const paste = page.getByTestId("paste");
  await expect(paste).toBeVisible();
  const pasteBox = await paste.boundingBox();
  expect(pasteBox).toBeTruthy();
  expect(pasteBox!.width).toBeGreaterThan(20);
  await openOpsMenu(page);
  for (const id of ["export", "plant-promise", "open-cmd"] as const) {
    const loc = page.getByTestId(id);
    await expect(loc).toBeVisible();
    const box = await loc.boundingBox();
    expect(box, id).toBeTruthy();
    expect(box!.width, id).toBeGreaterThan(20);
    expect(box!.height, id).toBeGreaterThan(12);
  }
  await clickOpsAction(page, "open-cmd");
  await expect(page.getByTestId("cmd-palette")).toBeVisible();
  await page.keyboard.press("Escape");
  await clickOpsAction(page, "export");
  await expect(page.getByTestId("export-out")).toBeVisible();
  await page.getByTestId("export-close").click();
  await page.getByTestId("paste").click();
  await expect(page.getByTestId("paste-dialog")).toBeVisible();
  await page.getByTestId("paste-close").click();
  await clickOpsAction(page, "plant-promise");
  await expect(page.getByTestId("promise-ops")).toBeVisible();
});

test("K1 草稿可删且须确认", async ({ page }) => {
  const book = "k1-del-" + Date.now();
  await page.goto("/");
  await page.getByTestId("book-name").fill(book);
  await page.getByTestId("create-book").click();
  await waitBookLabel(page, book);
  await page.getByTestId("intent").fill("还没定的一场");
  await page.getByTestId("write-next").click();
  await expect(page.locator(".card.draft").first()).toBeVisible();
  await expect(page.getByTestId("delete-draft")).toBeEnabled();
  await page.getByTestId("delete-draft").click();
  await expect(page.getByTestId("delete-draft-confirm")).toBeVisible();
  await page.getByTestId("delete-draft-cancel").click();
  await expect(page.getByTestId("delete-draft-confirm")).toHaveCount(0);
  await expect(page.locator(".card.draft").first()).toBeVisible();
  await page.getByTestId("delete-draft").click();
  await page.getByTestId("delete-draft-ok").click();
  await expect(page.locator(".card.draft")).toHaveCount(0);
});

test("K1 模型填这一场不自动进正史", async ({ page }) => {
  const book = "k1-fill-" + Date.now();
  await page.goto("/");
  await page.getByTestId("book-name").fill(book);
  await page.getByTestId("create-book").click();
  await waitBookLabel(page, book);
  await page.getByTestId("intent").fill("阿福发现刀");
  await page.getByTestId("write-next").click();
  await expect(page.locator(".card.draft").first()).toBeVisible();
  await expect(page.getByTestId("fill-live")).toBeVisible();
  await page.getByTestId("fill-live").click();
  await expect.poll(async () => {
    const st = await page.evaluate(async () => (await (await fetch("/api/state")).json()));
    return (st.committed || []).length;
  }, { timeout: 20000 }).toBe(0);
});
