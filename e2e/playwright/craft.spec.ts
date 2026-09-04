import { expect } from "@playwright/test";
import { test, selectDraftCard, openStripboard, waitBookLabel } from "./helpers";

const FORBIDDEN = "你现在应该写中点";

test("书级章法：主脑、导出按章、写下一场无节拍教条", async ({ page }) => {
  test.setTimeout(90000);
  const book = "渡口-" + Date.now();
  await page.goto("/");
  await page.getByTestId("book-name").fill(book);
  await page.getByTestId("create-book").click();
  await waitBookLabel(page, book);
  await openStripboard(page);
  await expect(page.getByTestId("open-craft")).toBeEnabled();

  await page.getByTestId("ent-kind").selectOption("person");
  await page.getByTestId("ent-name").fill("阿福");
  await page.getByTestId("new-entity").click();
  await expect(page.getByTestId("ent-阿福")).toBeVisible();
  await page.getByTestId("ent-kind").selectOption("place");
  await page.getByTestId("ent-name").fill("渡口");
  await page.getByTestId("new-entity").click();
  await expect(page.getByTestId("ent-渡口")).toBeVisible();

  await page.getByTestId("place-id").fill("渡口");
  await page.getByTestId("intent").fill("阿福发现刀");
  await page.getByTestId("write-next").click();
  await selectDraftCard(page);
  await page.locator('[data-testid="ent-阿福"]').dragTo(page.locator(".card.draft").first());
  await page.getByTestId("do-text").fill("阿福打开抽屉看见刀");
  await page.getByTestId("commit").click();
  await page.locator(".card.canon").first().waitFor({ timeout: 15000 });
  await page.getByTestId("density-mid").click();
  await expect(page.getByTestId("col-count")).toHaveText("4");

  await page.getByTestId("intent").fill("阿莲来找东西");
  await page.getByTestId("place-id").fill("渡口");
  await page.getByTestId("write-next").click();
  await selectDraftCard(page);
  await page.getByTestId("do-text").fill("阿莲进门");
  const committed = page.waitForResponse((r) => r.url().includes("/api/commit") && r.request().method() === "POST");
  await page.getByTestId("commit").click();
  await committed;
  await expect.poll(async () => {
    const st = await page.evaluate(async () => (await (await fetch("/api/state")).json()));
    return (st.committed || []).length;
  }).toBe(2);

  const st = await page.evaluate(async () => (await (await fetch("/api/state")).json()));
  const cols = (st.columns || []) as { id: string; display_ord: number }[];
  cols.sort((a, b) => a.display_ord - b.display_ord);
  expect(cols.length).toBeGreaterThanOrEqual(2);
  const col0 = cols[0].id;
  const col1 = cols[1].id;

  await page.getByTestId("open-craft").click();
  await expect(page.getByTestId("craft-dialog")).toBeVisible();
  await page.getByTestId("craft-premise").fill("铜牌三日，刀在抽屉。");
  await page.getByTestId("craft-add-chapter").click();
  await page.getByTestId("craft-title-0").fill("发现");
  await page.getByTestId("craft-start-0").selectOption(col0);
  await page.getByTestId("craft-add-chapter").click();
  await page.getByTestId("craft-title-1").fill("来找");
  await page.getByTestId("craft-start-1").selectOption(col1);
  const saved = page.waitForResponse((r) => r.url().includes("/api/craft") && r.request().method() === "POST");
  await page.getByTestId("craft-save").click();
  await saved;
  await expect(page.getByTestId("craft-msg")).toContainText("已写入书页");
  await page.getByTestId("craft-close").click();

  await expect(page.getByTestId("mini-chapters")).toBeVisible();
  await expect(page.getByTestId("mini-chapters")).toContainText("发现");
  await expect(page.getByTestId("mini-chapters")).toContainText("来找");

  const craft = await page.evaluate(async () => (await (await fetch("/api/craft")).json()));
  expect(craft.premise).toBe("铜牌三日，刀在抽屉。");
  expect((craft.chapters || []).length).toBe(2);

  const world = await page.evaluate(async () => (await (await fetch("/api/world?t=10")).json()));
  expect(JSON.stringify(world)).not.toContain("铜牌三日");
  expect(world).not.toHaveProperty("premise");
  expect(world).not.toHaveProperty("chapters");

  const md = await page.evaluate(async () => await (await fetch("/api/export?canon_only=1")).text());
  expect(md).toContain("# " + book);
  expect(md).toContain("> 主脑：铜牌三日，刀在抽屉。");
  expect(md).toContain("# 第1回 发现");
  expect(md).toContain("# 第2回 来找");
  expect(md.indexOf("# 第1回")).toBeLessThan(md.indexOf("阿福发现刀"));
  expect(md.indexOf("阿福发现刀")).toBeLessThan(md.indexOf("# 第2回"));
  expect(md).not.toContain(FORBIDDEN);

  await page.getByTestId("intent").fill("阿莲翻柜面");
  await page.getByTestId("write-next").click();
  await page.locator(".card.draft").first().waitFor();
  const body = await page.locator("body").innerText();
  expect(body).not.toContain(FORBIDDEN);
  expect(body).not.toContain("Save the Cat");
  expect(body).not.toContain("十五拍");
  const sidebar = await page.getByTestId("sidebar").innerText();
  expect(sidebar).not.toContain(FORBIDDEN);
  const sit = await page.evaluate(async () => await (await fetch("/api/circumstances")).text());
  expect(sit).not.toContain(FORBIDDEN);
  const nextJson = await page.evaluate(async () => {
    const r = await fetch("/api/write-next", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: "阿莲再问一次", place_id: "渡口" }),
    });
    return await r.text();
  });
  expect(nextJson).not.toContain(FORBIDDEN);
});
