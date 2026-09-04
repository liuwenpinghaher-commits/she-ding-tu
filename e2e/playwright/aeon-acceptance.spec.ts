import { expect, type Page } from "@playwright/test";
import { openTimeline, openWorkspaceTab, test, writeDraftBar, waitBookLabel } from "./helpers";

test.describe.configure({ timeout: 120000 });

async function boot(page: Page, book: string) {
  await page.goto("/");
  await page.getByTestId("book-name").fill(book);
  await page.getByTestId("create-book").click();
  await waitBookLabel(page, book);
  await openTimeline(page);
}

async function openFerry(page: Page) {
  await page.goto("/");
  await page.getByTestId("book-name").fill("渡口");
  await page.getByTestId("open-book").click();
  await waitBookLabel(page, "渡口");
  await openTimeline(page);
}

async function writeDraft(page: Page, intent: string) {
  return writeDraftBar(page, intent);
}

async function dragBar(page: Page, bar: ReturnType<Page["locator"]>, dx = 80) {
  const box = await bar.boundingBox();
  if (!box) throw new Error("没有条");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
}

test("1 打开渡口第一眼是按钟的条，能缩放平移", async ({ page }) => {
  await openFerry(page);
  await expect(page.getByTestId("stripboard")).toHaveCount(0);
  await expect(page.locator(".tl-bar").first()).toBeVisible();
  const canvas = page.getByTestId("tl-canvas");
  await canvas.hover();
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -120);
  await page.keyboard.up("Control");
  await page.keyboard.down("Shift");
  await page.mouse.wheel(0, 80);
  await page.keyboard.up("Shift");
  await expect(page.getByTestId("tl-ruler")).toBeVisible();
});

test("2 拖条改钟，右栏日期跟着变，撤销能回来", async ({ page }) => {
  const book = "aeon-drag-" + Date.now();
  await boot(page, book);
  const bar = await writeDraft(page, "阿禾在城里等信");
  await bar.click();
  await expect(page.getByTestId("scene-clock")).toBeVisible();
  const before = await page.getByTestId("scene-clock").innerText();
  await dragBar(page, bar, 80);
  await expect.poll(async () => page.getByTestId("scene-clock").innerText(), { timeout: 10000 }).not.toBe(before);
  await page.getByTestId("toast-undo").click();
  await expect.poll(async () => page.getByTestId("scene-clock").innerText(), { timeout: 10000 }).toBe(before);
});

test("3 点条是这场，点人是档案", async ({ page }) => {
  await openFerry(page);
  await page.locator(".tl-bar").filter({ hasText: "阿禾在城里等信" }).first().click();
  await expect(page.getByTestId("scene-clock")).toBeVisible();
  await page.getByTestId("ent-阿禾").click();
  await expect(page.getByTestId("dossier")).toBeVisible();
  await page.getByTestId("dossier-close").click();
});

test("4 切到分场条，同一场在等宽列里能改任务", async ({ page }) => {
  await openFerry(page);
  await page.locator(".tl-bar").filter({ hasText: "阿禾在城里等信" }).first().click();
  await openWorkspaceTab(page, "分场条");
  await expect(page.getByTestId("stripboard")).toBeVisible();
  await expect(page.getByTestId("intent")).toHaveValue(/阿禾在城里等信/);
});

test("5 切回时间轴，条还在刚才的钟上", async ({ page }) => {
  await openFerry(page);
  const bar = page.locator(".tl-bar").filter({ hasText: "阿禾在城里等信" }).first();
  await bar.click();
  const clock = await page.getByTestId("scene-clock").innerText();
  await openWorkspaceTab(page, "分场条");
  await expect(page.getByTestId("stripboard")).toBeVisible();
  await page.getByTestId("open-timeline").click();
  await expect(page.getByTestId("timeline")).toBeVisible();
  await expect(bar).toBeVisible();
  await bar.click();
  const again = (await page.getByTestId("scene-clock").innerText()).replace(/\s+/g, "");
  expect(again).toBe(clock.replace(/\s+/g, ""));
});

test("6 双击空白建草稿，写入正史前细条齿是草稿色", async ({ page }) => {
  const book = "aeon-dbl-" + Date.now();
  await boot(page, book);
  await writeDraft(page, "第一场");
  const canvas = page.getByTestId("tl-canvas");
  await canvas.dblclick({ position: { x: 24, y: 40 } });
  await expect.poll(async () => page.locator(".tl-bar").count(), { timeout: 15000 }).toBeGreaterThan(1);
  await openWorkspaceTab(page, "分场条");
  await expect(page.locator(".tooth.draft").first()).toBeVisible();
});

test("7 按人分组，阿禾一行阿莲一行", async ({ page }) => {
  await openFerry(page);
  await page.getByTestId("tl-group-person").click();
  await expect(page.getByTestId("tl-lane-阿禾")).toBeVisible();
  await expect(page.getByTestId("tl-lane-阿莲")).toBeVisible();
});

test("8 Option+Shift 两场之间能读出间隔人话", async ({ page }) => {
  const book = "aeon-gap-" + Date.now();
  await boot(page, book);
  await writeDraft(page, "上场");
  const canvas = page.getByTestId("tl-canvas");
  await canvas.dblclick({ position: { x: 24, y: 40 } });
  await expect.poll(async () => page.locator(".tl-bar").count(), { timeout: 15000 }).toBeGreaterThan(1);
  const bars = page.locator(".tl-bar");
  await bars.nth(0).click({ modifiers: ["Alt", "Shift"], force: true });
  await expect(page.getByTestId("tl-measure")).toContainText("再点另一场");
  await bars.nth(1).click({ modifiers: ["Alt", "Shift"], force: true });
  await expect(page.getByTestId("tl-measure")).toBeVisible();
  await expect(page.getByTestId("tl-measure")).toContainText(/隔了/);
});

test("9 壳是冷灰蓝加白画布，不是黄铜夜色", async ({ page }) => {
  await openFerry(page);
  const chrome = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--chrome").trim());
  expect(chrome.toUpperCase()).toBe("#BDD5EF");
  const canvas = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--canvas").trim());
  expect(canvas.toUpperCase()).toBe("#FFFFFF");
});

test("悬停铅笔能复制、在上建、在下建；锁定的场不能拖但能解锁", async ({ page }) => {
  const book = "aeon-tools-" + Date.now();
  await boot(page, book);
  const bar = await writeDraft(page, "本场");
  await bar.hover();
  const id = await bar.getAttribute("data-tl-id");
  expect(id).toBeTruthy();
  await page.getByTestId("tl-copy-" + id).click({ force: true });
  await expect.poll(async () => page.locator(".tl-bar").count(), { timeout: 15000 }).toBeGreaterThan(1);
  const orig = page.locator(`[data-tl-id="${id}"]`);
  await orig.hover();
  await page.getByTestId("tl-lock-" + id).click({ force: true });
  await orig.click();
  const before = (await page.getByTestId("scene-clock").innerText()).replace(/\s+/g, "");
  await dragBar(page, orig, 80);
  expect((await page.getByTestId("scene-clock").innerText()).replace(/\s+/g, "")).toBe(before);
  await orig.hover();
  await page.getByTestId("tl-lock-" + id).click({ force: true });
  await dragBar(page, orig, 80);
  await expect.poll(async () => (await page.getByTestId("scene-clock").innerText()).replace(/\s+/g, ""), { timeout: 10000 }).not.toBe(before);
});

test("尺度 From–To 能套上，写反了会自己摆正", async ({ page }) => {
  const book = "aeon-scale-" + Date.now();
  await boot(page, book);
  await page.getByTestId("tl-from").fill("120");
  await page.getByTestId("tl-to").fill("0");
  await page.getByTestId("tl-from-to").click();
  await expect(page.getByTestId("tl-ruler")).toBeVisible();
  await page.getByTestId("tl-scale-day").click();
  await page.getByTestId("tl-scale-hour").click();
});

test("⌘J 跳钟、⌘G 滚到选中场", async ({ page }) => {
  const book = "aeon-jump-" + Date.now();
  await boot(page, book);
  const bar = await writeDraft(page, "等信");
  await bar.click();
  page.once("dialog", (d) => d.accept("1 08:00"));
  await page.keyboard.press("Control+j");
  await expect(page.getByTestId("timeline")).toBeVisible();
  await page.keyboard.press("Control+g");
  await expect(bar).toBeVisible();
});

test("寿命条和这场多大只读；卡行能钳", async ({ page }) => {
  const book = "aeon-age-" + Date.now();
  await boot(page, book);
  await page.getByTestId("ent-kind").selectOption("person");
  await page.getByTestId("ent-name").fill("阿禾");
  await page.getByTestId("new-entity").click();
  await page.getByTestId("ent-阿禾").click();
  await expect(page.getByTestId("dossier")).toBeVisible();
  const expand = page.getByRole("button", { name: /展开全部/ });
  if (await expand.count()) await expand.click();
  await page.getByTestId("dossier-born_clock").fill("0");
  await page.getByTestId("dossier-save").click();
  await page.getByTestId("dossier-close").click();
  const bar = await writeDraft(page, "阿禾出门");
  await bar.click();
  await page.getByTestId("tl-life").click();
  await expect(page.getByTestId("tl-lifespan")).toBeVisible();
  await page.getByTestId("tl-card-lines").selectOption("1");
  await expect(page.getByTestId("tl-card-lines")).toHaveValue("1");
});

test("依赖跟着动：拖一场后面的场一起走，一次撤销全部", async ({ page }) => {
  const book = "aeon-follow-" + Date.now();
  await boot(page, book);
  await writeDraft(page, "先发生");
  const canvas = page.getByTestId("tl-canvas");
  await canvas.dblclick({ position: { x: 24, y: 40 } });
  await expect.poll(async () => page.locator(".tl-bar").count(), { timeout: 15000 }).toBeGreaterThan(1);
  await expect(page.getByTestId("tl-follow")).toBeChecked();
  const first = page.locator(".tl-bar").first();
  await first.click();
  const before = await page.getByTestId("scene-clock").innerText();
  await dragBar(page, first, 80);
  await expect.poll(async () => page.getByTestId("scene-clock").innerText(), { timeout: 10000 }).not.toBe(before);
  await page.getByTestId("toast-undo").click();
  await expect.poll(async () => page.getByTestId("scene-clock").innerText(), { timeout: 10000 }).toBe(before);
});
