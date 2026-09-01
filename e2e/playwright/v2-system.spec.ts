import { expect } from "@playwright/test";
import { test, pressUndo } from "./helpers";

test("删书须打书名；草稿撤销；总表；键盘改本页列数", async ({ page }) => {
  test.setTimeout(90000);
  const book = "sys-" + Date.now();
  await page.goto("/");
  await page.getByTestId("open-shelf").click();
  await expect(page.getByTestId("shelf")).toBeVisible();
  await page.getByTestId("shelf-new").click();
  await page.getByTestId("nb-name").fill(book);
  await page.getByTestId("nb-premise").fill("渡口夜里交信。");
  await page.getByTestId("nb-clock").fill("第一天 20:00");
  await page.getByTestId("nb-create").click();
  await expect(page.getByTestId("book-label")).toHaveText(book);

  await page.getByTestId("intent").fill("把信交出去");
  await page.getByTestId("write-next").click();
  await page.locator(".card.draft").first().waitFor();
  await page.locator(".card.draft").first().click();
  await page.getByTestId("delta-ent").fill("密信");
  await page.getByTestId("delta-attr").fill("holder");
  await page.getByTestId("delta-val").fill("船娘");
  await page.getByTestId("add-delta").click();
  await expect(page.getByTestId("delta-list")).toContainText("密信");
  await expect(page.getByTestId("undo")).toBeVisible();
  await pressUndo(page);
  await expect(page.getByTestId("delta-list")).not.toContainText("密信");

  await page.locator("#more-menu").evaluate((el: HTMLDetailsElement) => { el.open = true; });
  await page.getByTestId("open-table").click();
  await expect(page.getByTestId("table-view")).toBeVisible();
  await expect(page.getByTestId("table-body")).toContainText("把信交出去");
  await expect(page.getByTestId("table-body")).toContainText("草稿");
  await page.getByTestId("table-back").click();
  await expect(page.getByTestId("table-view")).not.toHaveClass(/show/);

  await page.keyboard.press("Alt+6");
  await expect(page.getByTestId("col-count")).toHaveText("6");
  await page.keyboard.press("Alt+4");
  await expect(page.getByTestId("col-count")).toHaveText("4");

  await page.getByTestId("open-shelf").click();
  await expect(page.getByTestId("shelf-progress-" + book)).toBeVisible();
  const card = page.locator("article").filter({ has: page.getByTestId("shelf-progress-" + book) });
  await card.scrollIntoViewIfNeeded();
  await card.locator("summary").click();
  await page.getByTestId("shelf-del-" + book).click();
  await expect(page.getByTestId("del-book")).toBeVisible();
  await expect(page.getByTestId("del-book-ok")).toBeDisabled();
  await page.getByTestId("del-book-type").fill("错名");
  await expect(page.getByTestId("del-book-ok")).toBeDisabled();
  await page.getByTestId("del-book-type").fill(book);
  await expect(page.getByTestId("del-book-ok")).toBeEnabled();
  await page.getByTestId("del-book-ok").click();
  await expect(page.getByTestId("shelf-grid")).not.toContainText(book);
});
