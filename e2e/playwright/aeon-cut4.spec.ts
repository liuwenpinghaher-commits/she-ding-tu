import { expect, type Page } from "@playwright/test";
import { openTimeline, openWorkspaceTab, test, writeDraftBar } from "./helpers";

test.describe.configure({ timeout: 120000 });

async function boot(page: Page, book: string) {
  await page.goto("/");
  await page.getByTestId("book-name").fill(book);
  await page.getByTestId("create-book").click();
  await expect(page.getByTestId("book-label")).toHaveText(book);
  await openTimeline(page);
}

async function writeDraft(page: Page, intent: string) {
  return writeDraftBar(page, intent);
}

async function st(page: Page) {
  return page.evaluate(async () => (await (await fetch("/api/state")).json()));
}

async function lastDraft(page: Page) {
  const s = await st(page);
  const drafts = s.drafts || [];
  const d = drafts[drafts.length - 1];
  if (!d) throw new Error("无草稿");
  return d;
}

test("讲述序能加幕加回，拖卡进文件夹", async ({ page }) => {
  const book = "cut4-nar-" + Date.now();
  await boot(page, book);
  await writeDraft(page, "第一场");
  const d = await lastDraft(page);
  await openWorkspaceTab(page, "讲述序");
  await expect(page.getByTestId("narrative-view")).toBeVisible();
  await page.getByTestId("nar-add-act").click();
  await expect(page.locator(".nar-folder").first()).toBeVisible();
  await page.getByTestId("nar-add-chapter").click();
  await expect(page.locator(".nar-folder.chapter")).toBeVisible();
  const folder = page.locator(".nar-folder").first();
  await page.getByTestId("narrative-card-" + d.id).dragTo(folder);
  await expect(folder.getByTestId("narrative-card-" + d.id)).toBeVisible();
});

test("讲述序拖卡改读序，故事时不变", async ({ page }) => {
  const book = "cut4-ord-" + Date.now();
  await boot(page, book);
  await writeDraft(page, "甲");
  const a = await lastDraft(page);
  await writeDraft(page, "乙");
  const b = await lastDraft(page);
  const before = await st(page);
  const clocks = (before.drafts || []).map((d: { id: string; draft: { clock_from: number } }) => [d.id, d.draft.clock_from]);
  await openWorkspaceTab(page, "讲述序");
  await page.getByTestId("nar-telling-up-" + b.id).click();
  await expect.poll(async () => {
    const s = await st(page);
    const db = (s.drafts || []).find((x: { id: string }) => x.id === b.id);
    return db?.draft?.telling_ord ?? null;
  }).toBe(1);
  const after = await st(page);
  const clocksAfter = (after.drafts || []).map((d: { id: string; draft: { clock_from: number } }) => [d.id, d.draft.clock_from]);
  expect(clocksAfter).toEqual(clocks);
  const world = await page.evaluate(async () => (await (await fetch("/api/world?t=10")).json()));
  expect(JSON.stringify(world)).not.toContain("telling_ord");
});

test("讲述序页签是藕紫", async ({ page }) => {
  const book = "cut4-purple-" + Date.now();
  await boot(page, book);
  await openWorkspaceTab(page, "讲述序");
  const tab = page.getByTestId("tab-讲述序");
  await expect(tab).toHaveClass(/narrative/);
  const bg = await tab.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg.replace(/\s/g, "")).toMatch(/176,\s*144,\s*240|rgb\(176,\s*144,\s*240\)|#b090f0/i);
});

test("分屏能并排总表和时间轴", async ({ page }) => {
  const book = "cut4-split-" + Date.now();
  await boot(page, book);
  await writeDraft(page, "一场");
  await page.getByTestId("split-view").click();
  await expect(page.getByTestId("pane-split")).toBeVisible();
  await page.getByTestId("split-kind").selectOption("总表");
  await expect(page.getByTestId("pane-split").getByTestId("table-view")).toBeVisible();
  await expect(page.getByTestId("pane-main").getByTestId("timeline")).toBeVisible();
});

test("分屏两枚时间轴能解开锁滚", async ({ page }) => {
  const book = "cut4-lock-" + Date.now();
  await boot(page, book);
  await writeDraft(page, "一场");
  await page.getByTestId("split-view").click();
  await page.getByTestId("split-kind").selectOption("时间轴");
  await expect(page.getByTestId("pane-main").getByTestId("timeline")).toBeVisible();
  await expect(page.getByTestId("pane-split").getByTestId("timeline")).toBeVisible();
  await expect(page.getByTestId("split-lock")).toBeVisible();
  await page.getByTestId("split-lock").uncheck();
  await expect(page.getByTestId("split-lock")).not.toBeChecked();
  await page.getByTestId("split-lock").check();
  await expect(page.getByTestId("split-lock")).toBeChecked();
});

test("分屏两边过滤互不影响", async ({ page }) => {
  const book = "cut4-filter-" + Date.now();
  await boot(page, book);
  await writeDraft(page, "草稿场");
  const d = await lastDraft(page);
  await page.evaluate(async (id) => {
    await fetch("/api/drafts/patch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, do_text: "走一步" }),
    });
    await fetch("/api/commit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
  }, d.id);
  await writeDraft(page, "还是草稿");
  await page.reload();
  await expect(page.getByTestId("book-label")).toHaveText(book);
  await page.getByTestId("split-view").click();
  await page.getByTestId("split-kind").selectOption("时间轴");
  await page.getByTestId("pane-main-filter-canon").click();
  await page.getByTestId("pane-split-filter-draft").click();
  await expect(page.getByTestId("pane-main").locator(".tl-bar.canon")).toHaveCount(1);
  await expect(page.getByTestId("pane-main").locator(".tl-bar.draft")).toHaveCount(0);
  await expect(page.getByTestId("pane-split").locator(".tl-bar.draft")).toHaveCount(1);
  await expect(page.getByTestId("pane-split").locator(".tl-bar.canon")).toHaveCount(0);
});

test("白板便笺不进正史", async ({ page }) => {
  const book = "cut4-note-" + Date.now();
  await boot(page, book);
  await writeDraft(page, "一场");
  const before = await st(page);
  await openWorkspaceTab(page, "白板");
  await expect(page.getByTestId("whiteboard")).toBeVisible();
  await page.getByTestId("wb-add-note").click();
  await expect(page.locator("[data-testid^='wb-note-']").first()).toBeVisible();
  const after = await st(page);
  expect((after.committed || []).length).toBe((before.committed || []).length);
  expect((after.drafts || []).length).toBe((before.drafts || []).length);
});

test("白板引用场能跳回分场条，拿掉卡片不删场", async ({ page }) => {
  const book = "cut4-wb-" + Date.now();
  await boot(page, book);
  await writeDraft(page, "一场");
  const d = await lastDraft(page);
  await page.locator(".tl-bar.draft").first().click();
  await openWorkspaceTab(page, "白板");
  await page.getByTestId("wb-add").click();
  await expect(page.getByTestId("wb-card-" + d.id)).toBeVisible();
  await page.getByTestId("wb-jump-sb-" + d.id).click();
  await expect(page.getByTestId("stripboard")).toBeVisible();
  await openWorkspaceTab(page, "白板");
  await page.getByTestId("wb-remove-" + d.id).click();
  await expect(page.getByTestId("wb-card-" + d.id)).toHaveCount(0);
  const s = await st(page);
  expect((s.drafts || []).some((x: { id: string }) => x.id === d.id)).toBeTruthy();
});
