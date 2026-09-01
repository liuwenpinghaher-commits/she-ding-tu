import { expect, type Page } from "@playwright/test";
import { test, selectDraftCard } from "./helpers";

test.describe.configure({ timeout: 120000 });

async function boot(page: Page, book: string) {
  await page.goto("/");
  await page.getByTestId("book-name").fill(book);
  await page.getByTestId("create-book").click();
  await expect(page.getByTestId("book-label")).toHaveText(book);
}

test("命令面板：空态、键盘走、回车", async ({ page }) => {
  const book = "bm-cmd-" + Date.now();
  await boot(page, book);
  await page.getByTestId("open-cmd").click();
  await expect(page.getByTestId("cmd-palette")).toBeVisible();
  await page.getByTestId("cmd-q").fill("zzzz-no-such-command");
  await expect(page.getByTestId("cmd-empty")).toHaveText("没有这条命令");
  await page.getByTestId("cmd-q").fill("");
  await expect(page.getByTestId("cmd-palette")).toContainText("书架");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("cmd-palette")).toHaveCount(0);
});

test("芯片拖回左栏拿掉在场", async ({ page }) => {
  const book = "bm-chip-" + Date.now();
  await boot(page, book);
  await page.getByTestId("ent-kind").selectOption("person");
  await page.getByTestId("ent-name").fill("阿禾");
  await page.getByTestId("new-entity").click();
  await page.getByTestId("ent-name").fill("船娘");
  await page.getByTestId("new-entity").click();
  await page.getByTestId("intent").fill("交信");
  await page.getByTestId("write-next").click();
  await selectDraftCard(page);
  await page.getByTestId("ent-阿禾").dragTo(page.locator(".card.draft").first());
  await page.getByTestId("ent-船娘").dragTo(page.locator(".card.draft").first());
  await expect(page.getByTestId("chip-阿禾")).toBeVisible();
  await expect(page.getByTestId("chip-船娘")).toBeVisible();
  await page.getByTestId("chip-船娘").dragTo(page.getByTestId("left-rail"));
  await expect(page.getByTestId("chip-船娘")).toHaveCount(0);
  await expect(page.getByTestId("chip-阿禾")).toBeVisible();
});

test("书架能搜、规定情境五块在、导出能下 md", async ({ page }) => {
  const book = "bm-shelf-" + Date.now();
  await boot(page, book);
  await expect(page.getByTestId("sit-blocks")).toBeVisible();
  await expect(page.getByTestId("sit-task")).toContainText("本场任务");
  await page.getByTestId("open-shelf").click();
  await expect(page.getByTestId("shelf-q")).toBeVisible();
  await page.getByTestId("shelf-q").fill("zzzz-no-book");
  await expect(page.getByTestId("shelf-empty")).toHaveText("没有这本书");
  await page.getByTestId("shelf-q").fill(book.slice(0, 8));
  await expect(page.locator(".book-card").filter({ hasText: book })).toBeVisible();
  await page.locator(".book-card").filter({ hasText: book }).click();
  await page.locator("#more-menu").evaluate((el: HTMLDetailsElement) => { el.open = true; });
  await page.getByTestId("export").click();
  await page.getByTestId("export-include-drafts").check();
  await page.getByTestId("export-run").click();
  await expect(page.getByTestId("export-out")).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("export-download").click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.md$/);
});

test("全书细条能拖本页窗口", async ({ page }) => {
  const book = "bm-mini-" + Date.now();
  await boot(page, book);
  for (let i = 0; i < 6; i++) {
    await page.getByTestId("add-column").click();
    await page.getByTestId("suggest-empty_col").click();
    await page.getByTestId("confirm-ok").click();
    await page.getByTestId("confirm-change").waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});
  }
  await page.getByTestId("density-sparse").click();
  await expect(page.getByTestId("col-count")).toHaveText("2");
  await page.getByTestId("tooth-0").click();
  const before = await page.evaluate(async () => (await (await fetch("/api/state")).json()).window_start);
  expect(before).toBe(0);
  const box = await page.getByTestId("tooth-0").boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + 48, box!.y + box!.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => page.evaluate(async () => (await (await fetch("/api/state")).json()).window_start)).toBeGreaterThan(0);
});
