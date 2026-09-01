import { expect } from "@playwright/test";
import { test } from "./helpers";

test.describe.configure({ timeout: 120000 });

test("方案第9节九条：建书到删正史", async ({ page }) => {
  const book = "v2-nine-" + Date.now();
  await page.goto("/");
  await page.getByTestId("open-shelf").click();
  await expect(page.getByTestId("shelf")).toBeVisible();
  await page.getByTestId("shelf-new").click();
  await expect(page.getByTestId("new-book-page")).toBeVisible();
  await page.getByTestId("nb-name").fill(book);
  await page.getByTestId("nb-premise").fill("渡口夜里要把信交出去。");
  await page.getByTestId("nb-clock").fill("第一天 20:00");
  await page.getByTestId("nb-create").click();
  await expect(page.getByTestId("book-label")).toHaveText(book);
  await expect(page.getByTestId("new-book-page")).not.toHaveClass(/show/);

  const craft = await page.evaluate(async () => (await (await fetch("/api/craft")).json()));
  expect(craft.clock_origin_label).toContain("20:00");
  expect(craft.premise).toContain("信");

  async function makeEnt(kind: string, name: string, extra?: Record<string, string>) {
    await page.getByTestId("ent-kind").selectOption(kind);
    await page.getByTestId("ent-name").fill(name);
    if (extra) {
      await page.getByTestId("rail-create").click();
      for (const [k, v] of Object.entries(extra)) {
        const box = page.getByTestId("ent-" + k);
        if ((await box.count()) && (await box.isVisible())) await box.fill(v);
      }
    }
    await page.getByTestId("new-entity").click();
    await expect(page.getByTestId("ent-" + name)).toBeVisible();
  }
  await makeEnt("person", "阿禾", { desire: "把信交出去", secret: "信不是自己的", speech: "短句" });
  await makeEnt("person", "船娘");
  await makeEnt("place", "渡口");
  await makeEnt("thing", "密信");
  await makeEnt("faction", "渡口帮");

  await page.getByTestId("ent-阿禾").click();
  await expect(page.getByTestId("dossier")).toBeVisible();
  await page.getByTestId("dossier-desire").fill("把信交出去");
  await page.getByTestId("dossier-secret").fill("信不是自己的");
  await page.getByTestId("dossier-speech").fill("短句");
  await page.getByTestId("dossier-save").click();
  await page.getByTestId("rel-kind").selectOption("member");
  await page.getByTestId("rel-target").fill("渡口帮");
  await page.getByTestId("rel-add").click();
  await expect(page.getByTestId("dossier-rels")).toContainText("渡口帮");
  await page.getByTestId("dossier-close").click();

  await page.getByTestId("ent-渡口帮").click();
  await expect(page.getByTestId("dossier-rels")).toContainText("阿禾");
  await page.getByTestId("dossier-close").click();

  await page.getByTestId("place-id").fill("渡口");
  await page.getByTestId("intent").fill("把信交出去");
  await page.getByTestId("write-next").click();
  await page.locator(".card.draft").first().waitFor();
  await page.locator(".card.draft").first().click();
  await page.locator('[data-testid="ent-阿禾"]').dragTo(page.locator(".card.draft").first());
  await page.locator('[data-testid="ent-船娘"]').dragTo(page.locator(".card.draft").first());
  await page.locator('[data-testid="ent-密信"]').dragTo(page.locator(".card.draft").first());
  await page.getByTestId("do-text").click();
  await page.keyboard.type("阿禾把");
  await page.keyboard.type("@密");
  await expect(page.getByTestId("mention-密信")).toBeVisible();
  await page.getByTestId("mention-密信").click();
  await page.keyboard.type("递过去。");
  await page.getByTestId("say-text").fill("阿禾：这封给你。\n船娘：收到。\n阿禾：别拆。");
  await page.getByTestId("think-text").fill("交出去就没事了。");
  await page.getByTestId("commit").click();
  await page.locator(".card.canon").first().waitFor({ timeout: 15000 });

  const st1 = await page.evaluate(async () => (await (await fetch("/api/state")).json()));
  const b1 = (st1.committed || []).find((b: { intent: string }) => b.intent.includes("把信交出去"));
  expect(b1).toBeTruthy();
  const col0 = b1.column_id;

  await page.getByTestId("intent").fill("岸上有人看着");
  await page.getByTestId("add-parallel").click();
  await page.locator(".card.draft").first().waitFor();
  const stP = await page.evaluate(async () => (await (await fetch("/api/state")).json()));
  const par = (stP.drafts || []).find((d: { draft: { intent: string } }) => d.draft.intent.includes("岸上"));
  expect(par.draft.column_id).toBe(col0);
  expect(par.draft.clock_from).toBe(b1.clock_from);
  await page.locator(".card.draft").first().click();
  await page.getByTestId("do-text").fill("远处有人抽烟。");
  await page.getByTestId("commit").click();
  await expect.poll(async () => {
    const st = await page.evaluate(async () => (await (await fetch("/api/state")).json()));
    return (st.committed || []).length;
  }, { timeout: 15000 }).toBe(2);

  await page.getByTestId("intent").fill("因为交信，船要提前开");
  await page.getByTestId("write-next").click();
  await page.locator(".card.draft").first().waitFor();
  await page.locator(".card.draft").first().click();
  await expect(page.getByTestId("intent")).toHaveValue(/因为交信/);
  await page.getByTestId("cause-beat").fill(b1.id);
  await page.getByTestId("do-text").fill("号子响了。");
  const commit3 = page.waitForResponse((r) => r.url().includes("/api/commit") && r.request().method() === "POST");
  await page.getByTestId("commit").click();
  const c3 = await commit3;
  expect(c3.ok(), await c3.text()).toBeTruthy();
  await expect.poll(async () => {
    const st = await page.evaluate(async () => (await (await fetch("/api/state")).json()));
    return (st.committed || []).length;
  }, { timeout: 15000 }).toBe(3);
  const st3 = await page.evaluate(async () => (await (await fetch("/api/state")).json()));

  const idx1 = (st3.columns || []).findIndex((c: { id: string }) => c.id === b1.column_id);
  if (idx1 >= 0) await page.getByTestId("tooth-" + idx1).click();
  await page.locator(`[data-testid="card-${b1.id}"]`).click();
  await expect(page.getByTestId("caused-by")).toContainText("因为交信");

  const st2 = await page.evaluate(async () => (await (await fetch("/api/state")).json()));
  const b2 = (st2.committed || []).find((b: { intent: string }) => b.intent.includes("岸上"));
  await page.locator(`[data-testid="card-${b2.id}"]`).click();
  await page.getByTestId("delta-ent").fill("密信");
  await page.getByTestId("delta-attr").fill("holder");
  await page.getByTestId("delta-val").fill("船娘");
  await page.getByTestId("add-delta").click();
  await page.getByTestId("know-who").fill("船娘");
  await page.getByTestId("know-fact").fill("密信在船娘手上");
  await page.getByTestId("know-cert").selectOption("knows");
  await page.getByTestId("add-know").click();
  await page.getByTestId("know-who").fill("阿禾");
  await page.getByTestId("know-fact").fill("密信还在自己身上");
  await page.getByTestId("know-cert").selectOption("wrong");
  await page.getByTestId("know-truth").fill("密信在船娘手上");
  await page.getByTestId("add-know").click();
  await page.getByTestId("revise").click();
  await expect(page.getByTestId("revise-msg")).toContainText("第几次写入正史仍是");

  const world = await page.evaluate(async (t) => (await (await fetch("/api/world?t=" + t)).json()), b2.clock_from);
  const blob = JSON.stringify(world);
  expect(blob).toMatch(/船娘|密信/);

  await page.getByTestId("open-timeline").click();
  await expect(page.getByTestId("timeline")).toBeVisible();
  await expect(page.getByTestId("tl-span")).toContainText("第");
  await page.getByTestId("tl-back").click();

  await page.locator(`[data-testid="card-${b1.id}"]`).click();
  await page.getByTestId("delete-canon").click();
  await expect(page.getByTestId("confirm-change")).toBeVisible();
  const impacts = await page.getByTestId("impact-list").innerText();
  expect(impacts).toContain("故事时间空洞");
  expect(impacts).toContain("因果");
  expect(impacts).toContain("因为交信");
  await page.getByTestId("suggest-leave_hole").click();
  await page.getByTestId("confirm-ok").click();
  await expect(page.getByTestId("confirm-change")).toBeHidden();
});

test("键盘走完写场、并列、本场变化", async ({ page }) => {
  const book = "v2-kbd-" + Date.now();
  await page.goto("/");
  await page.getByTestId("book-name").fill(book);
  await page.getByTestId("create-book").click();
  await expect(page.getByTestId("book-label")).toHaveText(book);
  await page.getByTestId("ent-name").fill("阿禾");
  await page.getByTestId("new-entity").click();
  await page.getByTestId("ent-kind").selectOption("place");
  await page.getByTestId("ent-name").fill("渡口");
  await page.getByTestId("new-entity").click();

  await page.getByTestId("intent").focus();
  await page.keyboard.type("把信交出去");
  await page.keyboard.press("Tab");
  await page.getByTestId("write-next").focus();
  await page.keyboard.press("Enter");
  await page.locator(".card.draft").first().waitFor();
  await page.keyboard.press("a");
  await page.getByTestId("presence-阿禾").press("Enter");
  await page.getByTestId("do-text").focus();
  await page.keyboard.type("递信。");
  await page.getByTestId("say-text").focus();
  await page.keyboard.type("给你。");
  await page.getByTestId("commit").focus();
  await page.keyboard.press("Enter");
  await page.locator(".card.canon").first().waitFor({ timeout: 15000 });

  await page.getByTestId("intent").fill("岸上有人看");
  await page.getByTestId("add-parallel").focus();
  await page.keyboard.press("Enter");
  await page.locator(".card.draft").first().waitFor();
  await page.getByTestId("delta-ent").focus();
  await page.keyboard.type("密信");
  await page.getByTestId("delta-attr").focus();
  await page.keyboard.type("holder");
  await page.getByTestId("delta-val").focus();
  await page.keyboard.type("船娘");
  await page.getByTestId("add-delta").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("delta-list")).toContainText("密信");
  await page.getByTestId("know-who").fill("船娘");
  await page.getByTestId("know-fact").fill("看见了");
  await page.getByTestId("know-cert").selectOption("wrong");
  await page.getByTestId("know-truth").fill("信已不在阿禾身上");
  await page.getByTestId("add-know").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("know-write-list")).toContainText("船娘");
});
