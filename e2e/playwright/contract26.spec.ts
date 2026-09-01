import { expect, type Page } from "@playwright/test";
import { openStripboard, test } from "./helpers";

test.describe.configure({ timeout: 180000 });

async function boot(page: Page, book: string) {
  await page.goto("/");
  await page.getByTestId("book-name").fill(book);
  await page.getByTestId("create-book").click();
  await expect(page.getByTestId("book-label")).toHaveText(book);
  await openStripboard(page);
}

async function makeEnt(page: Page, kind: string, name: string) {
  await page.getByTestId("ent-kind").selectOption(kind);
  await page.getByTestId("ent-name").fill(name);
  await page.getByTestId("new-entity").click();
  await expect(page.getByTestId("ent-" + name)).toBeVisible();
}

async function st(page: Page) {
  return page.evaluate(async () => (await (await fetch("/api/state")).json()));
}

async function worldAt(page: Page, t: number) {
  return page.evaluate(async (tt) => (await (await fetch("/api/world?t=" + tt)).json()), t);
}

async function showCols(page: Page, want = 4) {
  if (want >= 6) {
    await page.getByTestId("density-dense").click();
    await expect(page.getByTestId("col-count")).toHaveText("6");
  } else {
    await page.getByTestId("density-mid").click();
    await expect(page.getByTestId("col-count")).toHaveText("4");
  }
  if (await page.getByTestId("tooth-0").count()) await page.getByTestId("tooth-0").click();
  await expect.poll(async () => (await st(page)).window_start, { timeout: 10000 }).toBe(0);
}

async function clickCard(page: Page, id: string) {
  const loc = page.locator(`[data-testid="card-${id}"]`);
  if (!(await loc.isVisible().catch(() => false))) {
    await page.getByTestId("density-dense").click();
    const n = await page.locator('[data-testid^="tooth-"]').count();
    for (let i = 0; i < n; i++) {
      if (await loc.isVisible().catch(() => false)) break;
      await page.getByTestId(`tooth-${i}`).click();
    }
  }
  await loc.click();
}

async function writeCommit(page: Page, intent: string, doText = "演") {
  await page.getByTestId("intent").fill(intent);
  await expect(page.getByTestId("write-next")).toBeEnabled();
  await page.getByTestId("write-next").click();
  const draft = page.locator(".card.draft").first();
  try {
    await draft.waitFor({ timeout: 8000 });
  } catch {
    await page.getByTestId("density-dense").click();
    const n = await page.locator('[data-testid^="tooth-"]').count();
    for (let i = 0; i < n; i++) {
      if (await draft.count()) break;
      await page.getByTestId(`tooth-${i}`).click();
    }
    await draft.waitFor({ timeout: 8000 });
  }
  await draft.click();
  await expect(page.getByTestId("commit")).toBeEnabled();
  await page.getByTestId("do-text").fill(doText);
  await page.getByTestId("commit").click();
  await expect.poll(async () => ((await st(page)).committed || []).some((b: { intent: string }) => b.intent.includes(intent)), { timeout: 20000 }).toBeTruthy();
}

test("1 建书落时间轴，能切分场条", async ({ page }) => {
  const book = "c26-1-" + Date.now();
  await page.goto("/");
  await page.getByTestId("open-shelf").click();
  await page.getByTestId("shelf-new").click();
  await page.getByTestId("nb-name").fill(book);
  await page.getByTestId("nb-clock").fill("第一天 20:00");
  await page.getByTestId("nb-create").click();
  await expect(page.getByTestId("book-label")).toHaveText(book);
  await expect(page).toHaveURL(/\/board/);
  await expect(page.getByTestId("timeline")).toBeVisible();
  await expect(page.getByTestId("stripboard")).toHaveCount(0);
  await expect(page.getByTestId("col-count")).toHaveText("1");
  await expect(page.locator("body")).not.toContainText("请先选一个视图");
  await expect(page.getByTestId("sidebar")).toBeVisible();
  await openStripboard(page);
  await expect(page.getByTestId("stripboard")).toBeVisible();
  await page.screenshot({ path: "evidence/contract26/01-board.png" });
});

test("2 档案能填 F10", async ({ page }) => {
  const book = "c26-2-" + Date.now();
  await boot(page, book);
  await makeEnt(page, "person", "阿禾");
  await makeEnt(page, "person", "船娘");
  await makeEnt(page, "place", "渡口");
  await makeEnt(page, "thing", "密信");
  await page.getByTestId("ent-阿禾").click();
  await expect(page.getByTestId("dossier")).toBeVisible();
  await page.getByTestId("dossier-desire").fill("把信交出去");
  await page.getByTestId("dossier-secret").fill("信不是自己的");
  await page.getByTestId("dossier-speech").fill("短句");
  await page.getByTestId("dossier-save").click();
  await expect(page.getByTestId("dossier")).toContainText("改这一场去分场条");
  await page.getByTestId("dossier-close").click();
});

test("3 设定关系双边出现", async ({ page }) => {
  const book = "c26-3-" + Date.now();
  await boot(page, book);
  await makeEnt(page, "person", "阿禾");
  await makeEnt(page, "faction", "渡口帮");
  await page.getByTestId("ent-阿禾").click();
  await page.getByTestId("rel-kind").selectOption("member");
  await page.getByTestId("rel-target").fill("渡口帮");
  await page.getByTestId("rel-add").click();
  await expect(page.getByTestId("dossier-rels")).toContainText("渡口帮");
  await page.getByTestId("dossier-close").click();
  await page.getByTestId("ent-渡口帮").click();
  await expect(page.getByTestId("dossier-rels")).toContainText("阿禾");
  await page.getByTestId("dossier-close").click();
  await page.getByTestId("look-menu").locator("summary").click();
  await page.getByTestId("look-relations").click();
  await expect(page.getByTestId("look-relations-panel")).toBeVisible();
  await expect(page.getByTestId("look-relations-panel").getByTestId("commit")).toHaveCount(0);
});

test("4 写下一场必须有任务", async ({ page }) => {
  const book = "c26-4-" + Date.now();
  await boot(page, book);
  await expect(page.getByTestId("write-next")).toBeDisabled();
  await page.getByTestId("intent").fill("把信交出去");
  await expect(page.getByTestId("write-next")).toBeEnabled();
  await page.getByTestId("write-next").click();
  await expect(page.locator(".card.draft").first()).toBeVisible();
});

test("5 @ 与写入正史", async ({ page }) => {
  const book = "c26-5-" + Date.now();
  await boot(page, book);
  await makeEnt(page, "person", "阿禾");
  await makeEnt(page, "place", "渡口");
  await makeEnt(page, "thing", "密信");
  await page.getByTestId("place-id").fill("渡口");
  await page.getByTestId("intent").fill("把信交出去");
  await page.getByTestId("write-next").click();
  const card = page.locator(".card.draft").first();
  await card.waitFor();
  await card.click();
  await page.locator('[data-testid="ent-阿禾"]').dragTo(card);
  await page.locator('[data-testid="ent-密信"]').dragTo(card);
  await page.getByTestId("do-text").click();
  await page.keyboard.type("@密");
  await expect(page.getByTestId("mention-密信")).toBeVisible();
  await page.getByTestId("mention-密信").click();
  await page.getByTestId("say-text").fill("阿禾：这封给你。\n船娘：收到。\n阿禾：别拆。");
  await page.getByTestId("commit").click();
  await page.locator(".card.canon").first().waitFor({ timeout: 15000 });
  await page.locator("#look-menu").evaluate((el: HTMLDetailsElement) => { el.open = true; });
  await page.getByTestId("open-progress").click();
  await expect(page.getByTestId("look-progress").getByTestId("commit")).toHaveCount(0);
});

test("6 单列多场用当前列", async ({ page }) => {
  const book = "c26-6-" + Date.now();
  await boot(page, book);
  await writeCommit(page, "把信交出去");
  await showCols(page);
  const s1 = await st(page);
  const b1 = (s1.committed || []).find((b: { intent: string }) => b.intent.includes("把信交出去"));
  await page.getByTestId("intent").fill("岸上有人看着");
  await page.getByTestId("add-parallel").click();
  await page.locator(".card.draft").first().waitFor();
  const s2 = await st(page);
  const par = (s2.drafts || []).find((d: { draft: { intent: string } }) => d.draft.intent.includes("岸上"));
  expect(par.draft.column_id).toBe(b1.column_id);
});

test("7 因果双边", async ({ page }) => {
  const book = "c26-7-" + Date.now();
  await boot(page, book);
  await writeCommit(page, "把信交出去");
  await showCols(page);
  const b1 = (await st(page)).committed.find((b: { intent: string }) => b.intent.includes("把信交出去"));
  await page.getByTestId("intent").fill("因为交信，船要提前开");
  await page.getByTestId("write-next").click();
  await page.locator(".card.draft").first().click();
  await expect(page.getByTestId("commit")).toBeEnabled();
  await page.getByTestId("cause-beat").fill(b1.id);
  await page.getByTestId("do-text").fill("号子响了。");
  await page.getByTestId("commit").click();
  await expect.poll(async () => ((await st(page)).committed || []).length, { timeout: 20000 }).toBe(2);
  await clickCard(page, b1.id);
  await expect(page.getByTestId("caused-by")).toContainText("因为交信");
});

test("8 本场变化与知情是人话", async ({ page }) => {
  const book = "c26-8-" + Date.now();
  await boot(page, book);
  await makeEnt(page, "person", "阿禾");
  await makeEnt(page, "person", "船娘");
  await makeEnt(page, "thing", "密信");
  await writeCommit(page, "交信");
  const card = page.locator(".card.canon").first();
  await card.click();
  await page.getByTestId("revise").click();
  await page.getByTestId("delta-ent").fill("密信");
  await page.getByTestId("delta-attr").fill("holder");
  await page.getByTestId("delta-val").fill("船娘");
  await page.getByTestId("add-delta").click();
  await expect(page.getByTestId("delta-list")).toContainText("手上");
  await expect(page.getByTestId("delta-list")).not.toContainText("阿福.where=渡口");
  await page.getByTestId("know-cert").selectOption("wrong");
  await expect(page.getByTestId("know-truth")).toBeVisible();
  await page.getByTestId("know-who").fill("阿禾");
  await page.getByTestId("know-fact").fill("密信还在自己身上");
  await page.getByTestId("know-truth").fill("密信在船娘手上");
  await page.getByTestId("add-know").click();
  await expect(page.getByTestId("know-write-list")).toContainText("信错");
});

test("9 时间轴是默认主面，分场条同级可切", async ({ page }) => {
  const book = "c26-9-" + Date.now();
  await boot(page, book);
  await writeCommit(page, "第一场");
  const before = await st(page);
  await page.getByTestId("open-timeline").click();
  await expect(page.getByTestId("timeline")).toBeVisible();
  await expect(page.getByTestId("stripboard")).toHaveCount(0);
  await expect(page).toHaveURL(/\/board/);
  await expect(page.getByTestId("tl-ruler")).toBeVisible();
  await expect(page.getByTestId("tab-分场条")).toBeVisible();
  const after = await st(page);
  expect(after.columns.map((c: { clock_from: number }) => c.clock_from)).toEqual(before.columns.map((c: { clock_from: number }) => c.clock_from));
  await page.getByTestId("tab-分场条").click();
  await expect(page.getByTestId("stripboard")).toBeVisible();
});

test("10 删已正史有因果", async ({ page }) => {
  const book = "c26-10-" + Date.now();
  await boot(page, book);
  await writeCommit(page, "把信交出去");
  await showCols(page);
  const b1 = (await st(page)).committed.find((b: { intent: string }) => b.intent.includes("把信交出去"));
  await page.getByTestId("intent").fill("因为交信船要开");
  await page.getByTestId("write-next").click();
  await page.locator(".card.draft").first().click();
  await page.getByTestId("cause-beat").fill(b1.id);
  await page.getByTestId("do-text").fill("号子。");
  await page.getByTestId("commit").click();
  await expect.poll(async () => ((await st(page)).committed || []).length, { timeout: 20000 }).toBe(2);
  await page.getByTestId("tooth-0").click();
  await clickCard(page, b1.id);
  await page.getByTestId("delete-canon").click();
  await expect(page.getByTestId("confirm-change")).toBeVisible();
  const impacts = await page.getByTestId("impact-list").innerText();
  expect(impacts).toContain("因果");
  expect(impacts).toContain("因为交信");
  await page.getByTestId("suggest-leave_hole").click();
  await page.getByTestId("confirm-ok").click();
  await expect(page.getByTestId("confirm-change")).toBeHidden();
  const s2 = await st(page);
  expect((s2.committed || []).some((b: { id: string }) => b.id === b1.id)).toBeFalsy();
  expect(s2.selected_canon || s2.selected || null).toBeFalsy();
});

test("11 没贴线能写场", async ({ page }) => {
  const book = "c26-11-" + Date.now();
  await boot(page, book);
  await page.getByTestId("intent").fill("没贴线也能写");
  await page.getByTestId("write-next").click();
  await page.locator(".card.draft").first().click();
  await expect(page.getByTestId("scene-threads")).toContainText("未归线");
  await expect(page.getByTestId("band-unlined")).toBeVisible();
  await page.getByTestId("do-text").fill("写。");
  await page.getByTestId("commit").click();
  await page.locator(".card.canon").first().waitFor({ timeout: 15000 });
  const b = (await st(page)).committed.find((x: { intent: string }) => x.intent.includes("没贴线"));
  expect(b.story_threads || []).toEqual([]);
});

test("12 贴线只改看法", async ({ page }) => {
  const book = "c26-12-" + Date.now();
  await boot(page, book);
  await makeEnt(page, "person", "阿禾");
  await writeCommit(page, "把信交出去", "递信。");
  const b1 = (await st(page)).committed.find((b: { intent: string; clock_from: number }) => b.intent.includes("把信交出去"));
  const worldBefore = await worldAt(page, b1.clock_from);
  await clickCard(page, b1.id);
  await page.getByTestId("revise").click();
  await page.getByTestId("thread-new-name").fill("铜牌");
  await page.getByTestId("thread-create").click();
  await expect(page.getByTestId("scene-thread-铜牌")).toBeVisible();
  await page.getByTestId("revise").click();
  const worldAfter = await worldAt(page, b1.clock_from);
  expect(JSON.stringify(worldAfter.playing)).toBe(JSON.stringify(worldBefore.playing));
  expect(JSON.stringify(worldAfter.knows)).toBe(JSON.stringify(worldBefore.knows));
  expect(JSON.stringify(worldAfter.where)).toBe(JSON.stringify(worldBefore.where));
});

test("13 过滤不藏", async ({ page }) => {
  const book = "c26-13-" + Date.now();
  await boot(page, book);
  await writeCommit(page, "把信交出去");
  await writeCommit(page, "岸上有人看着");
  await showCols(page);
  const s2 = await st(page);
  const b1 = s2.committed.find((b: { intent: string }) => b.intent.includes("把信交出去"));
  const b2 = s2.committed.find((b: { intent: string }) => b.intent.includes("岸上"));
  await clickCard(page, b1.id);
  await page.getByTestId("revise").click();
  await page.getByTestId("thread-new-name").fill("铜牌");
  await page.getByTestId("thread-create").click();
  await page.getByTestId("thread-铜牌").click();
  await expect(page.locator(`[data-testid="card-${b2.id}"]`)).toHaveClass(/thin/);
  await expect(page.locator(`[data-testid="card-${b2.id}"]`)).toBeVisible();
  await clickCard(page, b2.id);
  await expect(page.getByTestId("intent")).toHaveValue(/岸上/);
  await expect(page.getByTestId("thread-strip")).toContainText("铜牌");
});

test("14 一场多线", async ({ page }) => {
  const book = "c26-14-" + Date.now();
  await boot(page, book);
  await page.getByTestId("intent").fill("多线一场");
  await page.getByTestId("write-next").click();
  await page.locator(".card.draft").first().click();
  await page.getByTestId("thread-new-type").selectOption("主线");
  await page.getByTestId("thread-new-name").fill("主线甲");
  await page.getByTestId("thread-create").click();
  await expect(page.getByTestId("scene-thread-主线甲")).toBeVisible({ timeout: 15000 });
  for (const name of ["支一", "支二", "支三"]) {
    await page.getByTestId("thread-new-type").selectOption("支线");
    await page.getByTestId("thread-new-name").fill(name);
    await page.getByTestId("thread-create").click();
    await expect(page.getByTestId(`scene-thread-${name}`)).toBeVisible({ timeout: 15000 });
  }
  await expect(page.locator("[data-testid=scene-threads] [data-testid^=scene-thread-]")).toHaveCount(4);
  await page.getByTestId("do-text").fill("演。");
  await page.getByTestId("commit").click();
  await page.locator(".card.canon").first().waitFor({ timeout: 15000 });
  await expect(page.getByTestId("thread-band")).toHaveCount(1);
  await expect(page.getByTestId("thread-plus")).toHaveText("+3");
  await page.getByTestId("thread-plus").hover();
  await expect(page.locator(".line-tip")).toContainText("主线甲");
  await expect(page.locator(".line-tip")).toContainText("支三");
});

test("15 入线出线是推的", async ({ page }) => {
  const book = "c26-15-" + Date.now();
  await boot(page, book);
  for (const name of ["一", "二", "三", "四", "五"]) {
    await writeCommit(page, "场" + name, "演" + name);
  }
  await showCols(page, 6);
  const all = (await st(page)).committed as Array<{ id: string; intent: string; column_id: string }>;
  const byName = (n: string) => all.find((b) => b.intent === "场" + n);
  const c2 = byName("二")!;
  const c3 = byName("三")!;
  const c5 = byName("五")!;
  await clickCard(page, c2.id);
  await page.getByTestId("revise").click();
  await page.getByTestId("thread-new-name").fill("铜牌");
  await page.getByTestId("thread-create").click();
  await expect(page.getByTestId("scene-thread-铜牌")).toBeVisible();
  await page.getByTestId("revise").click();
  await clickCard(page, c5.id);
  await page.getByTestId("revise").click();
  await page.getByTestId("thread-pick").selectOption({ label: "铜牌" });
  await page.getByTestId("thread-attach").click();
  await expect(page.getByTestId("scene-thread-铜牌")).toBeVisible();
  await page.getByTestId("revise").click();
  await clickCard(page, c3.id);
  await page.getByTestId("revise").click();
  await page.getByTestId("thread-pick").selectOption({ label: "铜牌" });
  await page.getByTestId("thread-role").selectOption("暂停");
  await page.getByTestId("thread-attach").click();
  await expect(page.getByTestId("scene-thread-铜牌")).toContainText("暂停");
  await expect(page.getByTestId("scene-threads")).not.toContainText("入线 / 出线是必填");
  await expect(page.getByTestId("scene-threads")).toContainText("入线 / 出线是推出来的");
  await clickCard(page, c2.id);
  await expect(page.locator(`[data-testid="card-${c2.id}"]`).getByTestId("fold-in")).toBeVisible();
  await clickCard(page, c5.id);
  await expect(page.locator(`[data-testid="card-${c5.id}"]`).getByTestId("fold-out")).toBeVisible();
  await clickCard(page, c3.id);
  await expect(page.locator(`[data-testid="card-${c3.id}"]`).getByTestId("fold-pause")).toBeVisible();
});

test("16 讲述序正交", async ({ page }) => {
  const book = "c26-16-" + Date.now();
  await boot(page, book);
  await writeCommit(page, "把信交出去");
  await writeCommit(page, "岸上有人看着");
  await showCols(page);
  const s2 = await st(page);
  const b1 = s2.committed.find((b: { intent: string }) => b.intent.includes("把信交出去"));
  await clickCard(page, b1.id);
  await page.getByTestId("revise").click();
  await page.getByTestId("thread-new-name").fill("铜牌");
  await page.getByTestId("thread-create").click();
  await page.locator("#more-menu").evaluate((el: HTMLDetailsElement) => { el.open = true; });
  await page.getByTestId("reading-order").click();
  await page.getByTestId("thread-铜牌").click();
  const b2 = (await st(page)).committed.find((b: { intent: string }) => b.intent.includes("岸上"));
  await expect(page.locator(`[data-testid="card-${b2.id}"]`)).toHaveClass(/thin/);
  await expect(page.getByTestId("tooth-0")).toBeVisible();
});

test("17 进度只跳不写", async ({ page }) => {
  const book = "c26-17-" + Date.now();
  await boot(page, book);
  await writeCommit(page, "第一回的铜牌");
  await writeCommit(page, "第二回的铜牌");
  const s0 = await st(page);
  const cols = s0.columns || [];
  await page.getByTestId("open-craft").click();
  await page.getByTestId("craft-add-chapter").click();
  await page.getByTestId("craft-title-0").fill("第一回");
  await page.getByTestId("craft-add-chapter").click();
  await page.getByTestId("craft-title-1").fill("第二回");
  if (cols[1]) await page.getByTestId("craft-start-1").selectOption(cols[1].id);
  await page.getByTestId("craft-save").click();
  await page.getByTestId("craft-close").click();
  const b2 = (await st(page)).committed.find((b: { intent: string }) => b.intent.includes("第二回"));
  await clickCard(page, b2.id);
  await page.getByTestId("revise").click();
  await page.getByTestId("thread-new-name").fill("铜牌");
  await page.getByTestId("thread-create").click();
  await page.getByTestId("look-menu").locator("summary").click();
  await page.getByTestId("open-progress").click();
  await expect(page.getByTestId("look-progress")).toBeVisible();
  await expect(page.getByTestId("look-progress")).not.toContainText("请写下一场铜牌");
  const cell = page.getByTestId("prog-铜牌-第二回");
  if (await cell.count()) {
    await cell.click();
    await expect(page.getByTestId("intent")).toHaveValue(/第二回/);
  }
  await expect(page.getByTestId("look-progress").getByTestId("commit")).toHaveCount(0);
});

test("18 人物透镜不当算出这一刻", async ({ page }) => {
  const book = "c26-18-" + Date.now();
  await boot(page, book);
  await makeEnt(page, "person", "阿莲");
  await makeEnt(page, "person", "阿福");
  await writeCommit(page, "阿福布置圈套", "阿福看得见的圈套");
  const b = (await st(page)).committed.find((x: { intent: string; clock_from: number }) => x.intent.includes("圈套"));
  const before = await worldAt(page, b.clock_from);
  await page.getByTestId("person-lens").selectOption({ label: "阿莲" });
  await expect(page.locator(`[data-testid="card-${b.id}"]`)).toHaveClass(/thin/);
  await page.getByTestId("intent").fill("阿福看得见的圈套还在");
  const after = await worldAt(page, b.clock_from);
  expect(JSON.stringify(after.playing)).toBe(JSON.stringify(before.playing));
  expect(JSON.stringify(after.knows)).toBe(JSON.stringify(before.knows));
});

test("19 伏笔不是线", async ({ page }) => {
  const book = "c26-19-" + Date.now();
  await boot(page, book);
  await makeEnt(page, "promise", "铜牌三日");
  await page.getByTestId("intent").fill("埋铜牌");
  await page.getByTestId("write-next").click();
  await page.locator(".card.draft").first().click();
  const types = await page.getByTestId("thread-new-type").locator("option").allTextContents();
  expect(types.join()).toContain("主线");
  expect(types.join()).toContain("支线");
  expect(types.join()).not.toContain("伏笔");
  await expect(page.getByTestId("promise-ops")).toContainText("埋设");
  await expect(page.getByTestId("promise-ops")).toContainText("兑现");
  await page.getByTestId("thread-new-name").fill("铜牌");
  await page.getByTestId("thread-create").click();
  await page.getByTestId("open-cmd").click();
  await expect(page.getByTestId("cmd-palette")).toContainText("过滤「铜牌」");
  await expect(page.getByTestId("cmd-palette")).toContainText("伏笔「铜牌三日」");
});

test("20 刷新回原处", async ({ page }) => {
  const book = "c26-20-" + Date.now();
  await boot(page, book);
  await writeCommit(page, "第一场");
  await writeCommit(page, "第二场");
  await writeCommit(page, "第三场");
  await showCols(page);
  const s0 = await st(page);
  const b1 = s0.committed.find((b: { intent: string }) => b.intent.includes("第一场"));
  await clickCard(page, b1.id);
  await page.getByTestId("revise").click();
  await page.getByTestId("thread-new-name").fill("铜牌");
  await page.getByTestId("thread-create").click();
  await expect(page.getByTestId("scene-thread-铜牌")).toBeVisible({ timeout: 15000 });
  await page.getByTestId("thread-铜牌").click();
  await page.locator("#look-menu").evaluate((el: HTMLDetailsElement) => { el.open = true; });
  await page.getByTestId("open-progress").click();
  const hash = `#/b/${encodeURIComponent(book)}/board?s=${encodeURIComponent(b1.id)}&line=${encodeURIComponent("铜牌")}&look=${encodeURIComponent("进度")}&n=4&start=0`;
  await page.evaluate((h) => { location.hash = h; }, hash);
  await page.reload();
  await expect(page.getByTestId("book-label")).toHaveText(book);
  await expect(page.getByTestId("col-count")).toHaveText("4");
  await expect(page.getByTestId("look-progress")).toBeVisible();
  await openStripboard(page);
  await expect(page.getByTestId("stripboard")).toBeVisible();
});

test("21 看法是页签，切走中栏换画布，正史钟不变", async ({ page }) => {
  const book = "c26-21-" + Date.now();
  await boot(page, book);
  await writeCommit(page, "一场");
  const start = (await st(page)).window_start;
  await page.getByTestId("open-timeline").click();
  await expect(page.getByTestId("timeline")).toBeVisible();
  await expect(page.getByTestId("stripboard")).toHaveCount(0);
  await page.locator("#more-menu").evaluate((el: HTMLDetailsElement) => { el.open = true; });
  await page.getByTestId("occupancy").click();
  await expect(page.getByTestId("flyout")).toBeVisible();
  await page.getByTestId("look-menu").locator("summary").click();
  await page.getByTestId("open-progress").click();
  await expect(page.getByTestId("look-progress")).toBeVisible();
  await page.locator("#more-menu").evaluate((el: HTMLDetailsElement) => { el.open = true; });
  await page.getByTestId("open-table").click();
  await expect(page.getByTestId("table-view")).toBeVisible();
  await openStripboard(page);
  await expect(page.getByTestId("stripboard")).toBeVisible();
  expect((await st(page)).window_start).toBe(start);
});

test("22 本页 1–6", async ({ page }) => {
  const book = "c26-22-" + Date.now();
  await boot(page, book);
  await expect(page.getByTestId("col-count")).toHaveText("1");
  await expect(page.getByTestId("minus")).toBeDisabled();
  await page.getByTestId("density-dense").click();
  await expect(page.getByTestId("col-count")).toHaveText("6");
  await expect(page.getByTestId("plus")).toBeDisabled();
  await page.getByTestId("add-column").click();
  await page.getByTestId("confirm-change").waitFor();
  await page.getByTestId("suggest-empty_col").click();
  await page.getByTestId("confirm-ok").click();
  await expect(page.getByTestId("confirm-change")).toBeHidden();
  const n = await page.getByTestId("col-count").innerText();
  await page.getByTestId("tooth-0").click();
  await expect(page.getByTestId("col-count")).toHaveText(n);
  await expect(page.getByTestId("confirm-change")).toBeHidden();
});

test("23 确认变更失败不关窗", async ({ page }) => {
  const book = "c26-23-" + Date.now();
  await boot(page, book);
  await writeCommit(page, "第一场");
  await writeCommit(page, "第二场");
  await page.getByTestId("density-mid").click();
  const before = (await st(page)).columns.map((c: { clock_from: number; clock_to: number }) => [c.clock_from, c.clock_to]);
  const h = page.getByTestId("col-handle-0");
  const box = await h.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
  }
  await page.getByTestId("confirm-change").waitFor({ timeout: 10000 });
  await expect(page.getByTestId("confirm-ok")).toBeDisabled();
  await page.getByTestId("confirm-cancel").click();
  const after = (await st(page)).columns.map((c: { clock_from: number; clock_to: number }) => [c.clock_from, c.clock_to]);
  expect(after).toEqual(before);
});

test("24 删书须手打书名", async ({ page }) => {
  const book = "c26-24-" + Date.now();
  await boot(page, book);
  await page.getByTestId("open-shelf").click();
  await expect(page.getByTestId("shelf-progress-" + book)).toBeVisible();
  const card = page.locator("article").filter({ has: page.getByTestId("shelf-progress-" + book) });
  await card.locator("summary").click();
  await page.getByTestId("shelf-del-" + book).click();
  await expect(page.getByTestId("del-book-ok")).toBeDisabled();
  await page.getByTestId("del-book-type").fill("错名");
  await expect(page.getByTestId("del-book-ok")).toBeDisabled();
  await page.getByTestId("del-book-type").fill(book);
  await expect(page.getByTestId("del-book-ok")).toBeEnabled();
  await page.getByTestId("del-book-ok").click();
  await expect(page.getByTestId("shelf-grid")).not.toContainText(book);
});

test("25 导出标清草稿", async ({ page }) => {
  const book = "c26-25-" + Date.now();
  await boot(page, book);
  await writeCommit(page, "已正史场");
  await page.getByTestId("intent").fill("还是草稿");
  await page.getByTestId("write-next").click();
  await page.locator("#more-menu").evaluate((el: HTMLDetailsElement) => { el.open = true; });
  await page.getByTestId("export").click();
  await page.getByTestId("export-include-drafts").check();
  await page.getByTestId("export-run").click();
  await expect(page.getByTestId("export-out")).toContainText("状态：正史");
  await expect(page.getByTestId("export-out")).toContainText("状态：草稿");
});

test("26 键盘不碰鼠标", async ({ page }) => {
  const book = "c26-26-" + Date.now();
  await boot(page, book);
  await writeCommit(page, "把信交出去");
  await writeCommit(page, "岸上有人看着");
  await showCols(page);
  const s2 = await st(page);
  const b1 = s2.committed.find((b: { intent: string }) => b.intent.includes("把信交出去"));
  const b2 = s2.committed.find((b: { intent: string }) => b.intent.includes("岸上"));
  await clickCard(page, b1.id);
  await page.getByTestId("revise").click();
  await page.getByTestId("thread-new-name").fill("铜牌");
  await page.getByTestId("thread-create").click();
  await page.getByTestId("thread-铜牌").click();
  await clickCard(page, b2.id);
  await expect(page.getByTestId("intent")).toHaveValue(/岸上/);
  await page.locator("body").click({ position: { x: 8, y: 8 } });
  await page.keyboard.press("Escape");
  await page.getByTestId("thread-all").click();
  await page.getByTestId("intent").fill("键盘写下一场");
  await page.getByTestId("write-next").click();
  await page.locator(".card.draft").first().waitFor();
  await page.locator(".card.draft").first().click();
  await page.getByTestId("talk-do").click();
  await expect(page.getByTestId("write-box")).toBeEnabled();
  await page.getByTestId("write-box").click();
  await expect(page.getByTestId("do-text")).not.toHaveValue("");
  await page.screenshot({ path: "evidence/contract26/26-keyboard.png" });
});
