import { expect } from "@playwright/test";
import { test } from "./helpers";

test.describe.configure({ timeout: 120000 });

test("逻辑线看法：贴线不改算出这一刻，过滤不藏场，看法不卸分场条", async ({ page }) => {
  const book = "line-" + Date.now();
  await page.goto("/");
  await page.getByTestId("book-name").fill(book);
  await page.getByTestId("create-book").click();
  await expect(page.getByTestId("book-label")).toHaveText(book);
  await expect(page.getByTestId("stripboard")).toBeVisible();

  await page.getByTestId("ent-kind").selectOption("person");
  await page.getByTestId("ent-name").fill("阿禾");
  await page.getByTestId("new-entity").click();
  await page.getByTestId("ent-kind").selectOption("place");
  await page.getByTestId("ent-name").fill("渡口");
  await page.getByTestId("new-entity").click();

  await page.getByTestId("intent").fill("把信交出去");
  await page.getByTestId("write-next").click();
  await page.locator(".card.draft").first().waitFor();
  await page.locator(".card.draft").first().click();
  await expect(page.getByTestId("scene-threads")).toContainText("未归线");
  await page.locator('[data-testid="ent-阿禾"]').dragTo(page.locator(".card.draft").first());
  await page.getByTestId("do-text").fill("阿禾把信递出去。");
  await page.getByTestId("commit").click();
  await page.locator(".card.canon").first().waitFor({ timeout: 15000 });

  const st1 = await page.evaluate(async () => (await (await fetch("/api/state")).json()));
  const b1 = (st1.committed || []).find((b: { intent: string }) => b.intent.includes("把信交出去"));
  expect(b1.story_threads || []).toEqual([]);
  const worldBefore = await page.evaluate(async (t) => (await (await fetch("/api/world?t=" + t)).json()), b1.clock_from);

  await page.getByTestId("intent").fill("岸上有人看着");
  await page.getByTestId("write-next").click();
  await page.locator(".card.draft").first().waitFor();
  await page.locator(".card.draft").first().click();
  await page.getByTestId("do-text").fill("远处有人抽烟。");
  await page.getByTestId("commit").click();
  await expect.poll(async () => {
    const st = await page.evaluate(async () => (await (await fetch("/api/state")).json()));
    return (st.committed || []).length;
  }, { timeout: 15000 }).toBe(2);

  await page.getByTestId("plus").click();
  await expect(page.getByTestId("col-count")).toHaveText("2");
  if (await page.getByTestId("tooth-0").count()) await page.getByTestId("tooth-0").click();
  else await page.getByTestId("prev").click();
  await expect(page.locator(`[data-testid="card-${b1.id}"]`)).toBeVisible();
  await page.locator(`[data-testid="card-${b1.id}"]`).click();
  await page.getByTestId("thread-new-name").fill("铜牌");
  await page.getByTestId("thread-create").click();
  await expect(page.getByTestId("scene-thread-铜牌")).toBeVisible();
  await expect(page.getByTestId("thread-strip")).toContainText("铜牌");

  const worldAfter = await page.evaluate(async (t) => (await (await fetch("/api/world?t=" + t)).json()), b1.clock_from);
  expect(JSON.stringify(worldAfter.playing)).toBe(JSON.stringify(worldBefore.playing));
  expect(JSON.stringify(worldAfter.knows)).toBe(JSON.stringify(worldBefore.knows));
  expect(JSON.stringify(worldAfter.where)).toBe(JSON.stringify(worldBefore.where));

  const st2 = await page.evaluate(async () => (await (await fetch("/api/state")).json()));
  const b2 = (st2.committed || []).find((b: { intent: string }) => b.intent.includes("岸上"));
  await page.getByTestId("thread-铜牌").click();
  await expect(page.locator(`[data-testid="card-${b2.id}"]`)).toHaveClass(/thin/);
  await expect(page.locator(`[data-testid="card-${b2.id}"]`)).toBeVisible();
  await page.locator(`[data-testid="card-${b2.id}"]`).click();
  await expect(page.getByTestId("intent")).toHaveValue(/岸上/);
  await expect(page.getByTestId("thread-strip")).toContainText("铜牌");

  await page.getByTestId("open-timeline").click();
  await expect(page.getByTestId("timeline")).toBeVisible();
  await expect(page.getByTestId("stripboard")).toBeVisible();
  await expect(page.getByTestId("timeline")).toHaveClass(/look-rail/);
  await page.getByTestId("tl-back").click();
  await expect(page.getByTestId("timeline")).not.toHaveClass(/show/);
  await expect(page.getByTestId("stripboard")).toBeVisible();

  await page.locator("#more-menu").evaluate((el: HTMLDetailsElement) => { el.open = true; });
  await page.getByTestId("open-table").click();
  await expect(page.getByTestId("table-view")).toBeVisible();
  await expect(page.getByTestId("stripboard")).toBeVisible();
  await expect(page.getByTestId("commit")).toBeVisible();
  await page.getByTestId("table-back").click();

  await page.getByTestId("look-menu").locator("summary").click();
  await page.getByTestId("open-progress").click();
  await expect(page.getByTestId("look-progress")).toBeVisible();
  await expect(page.getByTestId("stripboard")).toBeVisible();
  await expect(page.getByTestId("look-progress").getByTestId("commit")).toHaveCount(0);
  await page.getByTestId("progress-back").click();

  await page.getByTestId("thread-all").click();
  await expect(page.locator(`[data-testid="card-${b2.id}"]`)).not.toHaveClass(/thin/);
});
