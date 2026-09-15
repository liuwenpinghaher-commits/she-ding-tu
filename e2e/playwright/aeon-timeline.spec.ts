import { expect } from "@playwright/test";
import { openTimeline, openWorkspaceTab, test, writeDraftBar, waitBookLabel } from "./helpers";

test.describe.configure({ timeout: 120000 });

test("打开书第一眼是分场条，切到时间轴能缩放、切分场条、双击建草稿、分组、分屏", async ({ page }) => {
  const book = "aeon-" + Date.now();
  await page.goto("/");
  await page.getByTestId("book-name").fill(book);
  await page.getByTestId("create-book").click();
  await waitBookLabel(page, book);
  await expect(page.getByTestId("stripboard")).toBeVisible();
  await openTimeline(page);
  await expect(page.getByTestId("tl-ruler")).toBeVisible();
  await expect(page.getByTestId("stripboard")).toHaveCount(0);

  const chrome = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--chrome").trim());
  expect(chrome.toUpperCase()).toBe("#BDD5EF");

  const bar = await writeDraftBar(page, "阿禾在城里等信");
  await bar.click();
  await expect(page.getByTestId("scene-clock")).toBeVisible();
  await expect(page.getByTestId("item-colors")).toBeVisible();
  await page.getByTestId("swatch-珊瑚").click();
  const before = await page.getByTestId("scene-clock").innerText();

  const box = await bar.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
  }
  await expect.poll(async () => page.getByTestId("scene-clock").innerText(), { timeout: 10000 }).not.toBe(before);

  await page.getByTestId("toast-undo").click();
  await expect.poll(async () => page.getByTestId("scene-clock").innerText(), { timeout: 10000 }).toBe(before);

  await openWorkspaceTab(page, "分场条");
  await expect(page.getByTestId("stripboard")).toBeVisible();
  await expect(page.getByTestId("intent")).toHaveValue(/阿禾在城里等信/);

  await page.getByTestId("open-timeline").click();
  await expect(page.getByTestId("timeline")).toBeVisible();
  await expect(page.locator(".tl-bar").first()).toBeVisible();

  const canvas = page.getByTestId("tl-canvas");
  await canvas.dblclick({ position: { x: 24, y: 40 } });
  await expect.poll(async () => page.locator(".tl-bar").count(), { timeout: 15000 }).toBeGreaterThan(1);

  const bars = page.locator(".tl-bar");
  await bars.nth(0).click({ modifiers: ["Alt", "Shift"], force: true });
  await bars.nth(1).click({ modifiers: ["Alt", "Shift"], force: true });
  await expect(page.getByTestId("tl-measure")).toBeVisible();

  await page.getByTestId("tl-group-person").click();
  await expect(page.locator("[data-testid^='tl-lane-']").first()).toBeVisible();

  await expect(page.getByTestId("tl-resolve-all")).toBeVisible();
  await expect(page.getByTestId("tl-scale-slider")).toBeVisible();

  await openWorkspaceTab(page, "总表");
  await expect(page.getByTestId("table-view")).toBeVisible();
  await openWorkspaceTab(page, "讲述序");
  await expect(page.getByTestId("narrative-view")).toBeVisible();
  await page.getByTestId("nar-add-act").click();
  await expect(page.locator(".nar-folder").first()).toBeVisible();

  await page.getByTestId("open-timeline").click();
  await page.getByTestId("split-view").click();
  await expect(page.getByTestId("pane-split")).toBeVisible();
  await expect(page.getByTestId("split-lock")).toBeVisible();
});

test("打开渡口第一眼是分场条，切到时间轴按人分组能看见阿禾阿莲", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("book-name").fill("渡口");
  await page.getByTestId("open-book").click();
  await waitBookLabel(page, "渡口");
  await expect(page.getByTestId("stripboard")).toBeVisible();
  await expect(page.getByTestId("timeline")).toHaveCount(0);
  await openTimeline(page);
  await expect(page.locator(".tl-bar").first()).toBeVisible();
  const chrome = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--chrome").trim());
  expect(chrome.toUpperCase()).toBe("#BDD5EF");
  await page.getByTestId("tl-group-person").click();
  await expect(page.getByTestId("tl-lane-阿禾")).toBeVisible();
  await expect(page.getByTestId("tl-lane-阿莲")).toBeVisible();
  await page.locator(".tl-bar").filter({ hasText: "阿禾在城里等信" }).first().click();
  await expect(page.getByTestId("scene-clock")).toBeVisible();
  await page.getByTestId("ent-阿禾").click();
  await expect(page.getByTestId("dossier")).toBeVisible();
  await page.getByTestId("dossier-close").click();
  await openWorkspaceTab(page, "分场条");
  await expect(page.getByTestId("stripboard")).toBeVisible();
  await page.getByTestId("open-timeline").click();
  await expect(page.getByTestId("timeline")).toBeVisible();
  await expect(page.locator(".tl-bar").filter({ hasText: "阿禾在城里等信" }).first()).toBeVisible();
});
