import { expect } from "@playwright/test";
import { openStripboard, test } from "./helpers";

test.describe.configure({ timeout: 120000 });

test("12.2 色带、窗口件、缺页面、看法", async ({ page }) => {
  const book = "cut122-" + Date.now();
  await page.goto("/");
  await page.getByTestId("open-shelf").click();
  await expect(page.getByTestId("shelf")).toBeVisible();
  await page.getByTestId("shelf-new").click();
  await page.getByTestId("nb-name").fill(book);
  await page.getByTestId("nb-premise").fill("夜里交信。");
  await page.getByTestId("nb-clock").fill("第一天 20:00");
  await page.getByTestId("nb-create").click();
  await expect(page.getByTestId("book-label")).toHaveText(book);
  await openStripboard(page);
  await page.getByTestId("plus").click();
  await expect(page.getByTestId("col-count")).toHaveText("2");
  await page.getByTestId("density-mid").click();
  await expect(page.getByTestId("col-count")).toHaveText("4");

  await page.getByTestId("ent-name").fill("阿禾");
  await page.getByTestId("new-entity").click();
  await page.getByTestId("ent-kind").selectOption("place");
  await page.getByTestId("ent-name").fill("渡口");
  await page.getByTestId("new-entity").click();

  await page.getByTestId("intent").fill("把信交出去");
  await page.getByTestId("write-next").click();
  await page.locator(".card.draft").first().waitFor();
  await expect(page.getByTestId("band-unlined")).toBeVisible();
  await page.locator(".card.draft").first().click();
  await page.getByTestId("thread-new-name").fill("铜牌");
  await page.getByTestId("thread-create").click();
  await expect(page.getByTestId("scene-thread-铜牌")).toBeVisible();
  await expect(page.getByTestId("thread-band")).toBeVisible();
  await page.getByTestId("do-text").fill("递信。");
  await page.getByTestId("commit").click();
  await page.locator(".card.canon").first().waitFor({ timeout: 15000 });
  await expect(page.getByTestId("thread-band")).toBeVisible();

  await page.getByTestId("open-timeline").click();
  await expect(page.getByTestId("timeline")).toBeVisible();
  await expect(page.getByTestId("tl-scale-book")).toBeVisible();
  await page.getByTestId("tab-分场条").click();
  await expect(page.getByTestId("stripboard")).toBeVisible();

  await page.locator("#more-menu").evaluate((el: HTMLDetailsElement) => { el.open = true; });
  await page.getByTestId("occupancy").click();
  await expect(page.getByTestId("occ-matrix")).toBeVisible();
  await page.getByTestId("flyout-close").click();

  await page.getByTestId("open-shelf").click();
  await expect(page.getByTestId("shelf-grid")).toContainText(book);
  await expect(page.getByTestId("shelf-grid")).toContainText("夜里交信");
  await expect(page.getByTestId("shelf-grid")).toContainText("正史");
});
