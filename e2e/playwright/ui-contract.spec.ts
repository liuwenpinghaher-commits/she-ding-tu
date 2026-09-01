import { expect, type Page } from "@playwright/test";
import { test, selectDraftCard, openStripboard } from "./helpers";

async function openMore(page: Page) {
  await page.locator("#more-menu").evaluate((el: HTMLDetailsElement) => { el.open = true; });
}
async function closeMore(page: Page) {
  await page.locator("#more-menu").evaluate((el: HTMLDetailsElement) => { el.open = false; });
}

test("1 场卡密度、细轨、点列看这一刻", async ({ page }) => {
  const book = "ui-p1-" + Date.now();
  await page.goto("/");
  await page.getByTestId("book-name").fill(book);
  await page.getByTestId("create-book").click();
  await expect(page.getByTestId("book-label")).toHaveText(book);
  await openStripboard(page);

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
  await page.getByTestId("say-text").fill("在这儿。");
  await page.getByTestId("think-text").fill("别让阿莲看见。");
  await page.getByTestId("commit").click();
  await page.locator(".card.canon").first().waitFor({ timeout: 15000 });

  await expect(page.getByTestId("unwritten-shift")).toHaveText("未写转折");
  await expect(page.getByTestId("card-title")).toHaveText("未名场");
  await expect(page.locator('[data-testid="track-col0-person"]')).toHaveClass(/on/);
  await expect(page.locator('[data-testid="track-col0-place"]')).toHaveClass(/on/);

  await page.getByTestId("density-dense").click();
  await expect(page.getByTestId("col-count")).toHaveText("6");
  await expect(page.getByTestId("unwritten-shift")).toHaveCount(0);
  await expect(page.getByTestId("warn-dot")).toBeVisible();
  await expect(page.getByTestId("card-do")).toHaveCount(0);

  await page.getByTestId("density-sparse").click();
  await expect(page.getByTestId("col-count")).toHaveText("2");
  await expect(page.getByTestId("card-do")).toContainText("阿福打开抽屉看见刀");
  await expect(page.getByTestId("card-say")).toContainText("在这儿");
  await expect(page.getByTestId("card-think")).toContainText("别让阿莲看见");
  await expect(page.getByTestId("unwritten-shift")).toBeVisible();

  await page.getByTestId("density-mid").click();
  await page.getByTestId("ent-kind").selectOption("person");
  await page.getByTestId("ent-name").fill("阿莲");
  await page.getByTestId("new-entity").click();
  await page.getByTestId("intent").fill("阿莲来找东西");
  await page.getByTestId("place-id").fill("渡口");
  await page.getByTestId("write-next").click();
  await page.locator(".card.draft").first().waitFor();
  await page.locator(".card.draft").first().click();
  await page.getByTestId("do-text").fill("阿莲进门");
  await page.getByTestId("commit").click();
  await expect(page.locator(".card.canon")).toHaveCount(2, { timeout: 15000 });

  const st = await page.evaluate(async () => (await (await fetch("/api/state")).json()));
  const col1 = (st.columns || []).find((c: { id: string }) => c.id !== "col0") || st.columns[1];
  expect(col1).toBeTruthy();
  await page.getByTestId("ruler-col-1").click();
  await expect(page.getByTestId("moment-col")).toContainText("t=" + col1.clock_from);
  const world = await page.evaluate(async (t) => (await (await fetch("/api/world?t=" + t)).json()), col1.clock_from);
  expect(world.t).toBe(col1.clock_from);
  const moment = await page.getByTestId("moment-body").innerText();
  expect(moment).toContain("t=" + world.t);

  await page.getByTestId("intent").fill("还没写的一场");
  await page.getByTestId("write-next").click();
  await selectDraftCard(page);
  await page.locator('[data-testid="ent-阿莲"]').dragTo(page.locator(".card.draft").first());
  const st2 = await page.evaluate(async () => (await (await fetch("/api/state")).json()));
  const draftCol = st2.drafts[0].draft.column_id;
  const committedOnDraftCol = (st2.committed || []).some((b: { column_id: string }) => b.column_id === draftCol);
  if (!committedOnDraftCol) {
    await expect(page.locator(`[data-testid="track-${draftCol}-person"]`)).not.toHaveClass(/on/);
  }
});

test("2 写戏路径：空任务不准点、讨论不进框、模型待确认", async ({ page }) => {
  const book = "ui-p2-" + Date.now();
  await page.goto("/");
  await page.getByTestId("book-name").fill(book);
  await page.getByTestId("create-book").click();
  await expect(page.getByTestId("book-label")).toHaveText(book);

  await expect(page.getByTestId("write-next")).toBeDisabled();
  await expect(page.getByTestId("write-next")).toHaveAttribute("title", "没有本场任务不准写下一场");

  await page.getByTestId("intent").fill("阿福发现刀");
  await expect(page.getByTestId("write-next")).toBeEnabled();
  await page.getByTestId("write-next").click();
  await page.locator(".card.draft").first().waitFor();
  await page.locator(".card.draft").first().click();
  await expect(page.getByTestId("do-text")).toHaveValue("");

  const before = await page.getByTestId("do-text").inputValue();
  await page.getByTestId("talk-do").click();
  await expect(page.getByTestId("discuss-panel")).toBeVisible();
  await expect(page.getByTestId("do-text")).toHaveValue(before);
  await page.getByTestId("write-box").click();
  await expect(page.getByTestId("do-text")).toHaveValue(/讨论稿：/);

  await page.getByTestId("do-text").fill("");
  await page.getByTestId("fill-fake").click();
  await expect(page.getByTestId("discuss-draft")).toContainText("动作：", { timeout: 15000 });
  await expect(page.getByTestId("do-text")).toHaveValue("");
  await page.getByTestId("write-box").click();
  await expect(page.getByTestId("do-text")).not.toHaveValue("");
  const committed = await page.evaluate(async () => (await (await fetch("/api/state")).json()).committed);
  expect(committed || []).toEqual([]);
});

async function clocks(page) {
  const st = await page.evaluate(async () => (await (await fetch("/api/state")).json()));
  return (st.columns || []).map((c: { id: string; clock_from: number; clock_to: number }) => ({
    id: c.id, from: c.clock_from, to: c.clock_to,
  }));
}

async function dragHandle(page, testid: string, dx: number) {
  const h = page.getByTestId(testid);
  const box = await h.boundingBox();
  if (!box) throw new Error("no handle " + testid);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
}

test("3 真拖列、空出建议、细条窗口、顶栏+不加列", async ({ page }) => {
  const book = "ui-p3-" + Date.now();
  await page.goto("/");
  await page.getByTestId("book-name").fill(book);
  await page.getByTestId("create-book").click();
  await expect(page.getByTestId("book-label")).toHaveText(book);
  await openStripboard(page);
  await page.getByTestId("intent").fill("第一场");
  await expect(page.getByTestId("write-next")).toBeEnabled();
  await page.getByTestId("write-next").click();
  await page.locator(".card.draft").first().waitFor();
  await page.locator(".card.draft").first().click();
  await page.getByTestId("do-text").fill("演");
  await page.getByTestId("commit").click();
  await page.locator(".card.canon").first().waitFor({ timeout: 15000 });
  await page.getByTestId("density-mid").click();
  await expect(page.getByTestId("col-count")).toHaveText("4");
  await page.getByTestId("intent").fill("第二场");
  await page.getByTestId("write-next").click();
  await page.locator(".card.draft").first().waitFor();
  await page.locator(".card.draft").first().click();
  await page.getByTestId("do-text").fill("再演");
  await page.getByTestId("commit").click();
  await expect(page.locator(".card.canon")).toHaveCount(2, { timeout: 15000 });

  const before = await clocks(page);
  expect(before.length).toBeGreaterThanOrEqual(2);
  await dragHandle(page, "col-handle-0", 90);
  await page.getByTestId("confirm-change").waitFor({ timeout: 10000 });
  for (const k of ["compress", "shift", "merge", "empty", "parallel", "shift_back", "spare", "cancel"]) {
    await expect(page.getByTestId("suggest-" + k)).toBeVisible();
  }
  await expect(page.getByTestId("confirm-ok")).toBeDisabled();
  await page.getByTestId("confirm-cancel").click();
  expect(await clocks(page)).toEqual(before);

  await dragHandle(page, "col-handle-0", 90);
  await page.getByTestId("confirm-change").waitFor();
  await page.getByTestId("suggest-compress").click();
  await expect(page.getByTestId("confirm-ok")).toBeEnabled();
  await page.getByTestId("confirm-ok").click();
  const after = await clocks(page);
  const sorted = [...after].sort((a, b) => a.from - b.from);
  for (let i = 0; i < sorted.length - 1; i++) {
    expect(sorted[i].to).toBeLessThanOrEqual(sorted[i + 1].from);
  }
  expect(after).not.toEqual(before);

  await dragHandle(page, "col-handle-0", -80);
  await page.getByTestId("confirm-change").waitFor();
  await expect(page.getByTestId("suggest-shift_back")).toBeVisible();
  await expect(page.getByTestId("suggest-merge_next")).toBeVisible();
  await expect(page.getByTestId("suggest-spare")).toBeVisible();
  await page.getByTestId("confirm-cancel").click();

  const nBefore = await page.getByTestId("col-count").innerText();
  const colCountBefore = (await clocks(page)).length;
  await page.getByTestId("plus").click();
  await expect(page.getByTestId("col-count")).toHaveText(String(Number(nBefore) + 1));
  expect((await clocks(page)).length).toBe(colCountBefore);

  for (let i = 0; i < 6; i++) {
    await page.getByTestId("add-column").click();
    await page.getByTestId("suggest-empty_col").click();
    await page.getByTestId("confirm-ok").click();
    await page.waitForTimeout(150);
  }
  const many = await clocks(page);
  expect(many.length).toBeGreaterThanOrEqual(8);
  await page.getByTestId("tooth-7").click();
  const st = await page.evaluate(async () => (await (await fetch("/api/state")).json()));
  expect(st.window_start).toBe(7);
  await expect(page.getByTestId("column-0")).toBeVisible();
  await expect(page.getByTestId("mini-window")).toBeVisible();
});

test("4 左栏、飞出层、多书、丢一段草稿", async ({ page }) => {
  test.setTimeout(60000);
  const bookA = "ui-p4a-" + Date.now();
  const bookB = "ui-p4b-" + Date.now();
  await page.goto("/");
  await page.getByTestId("book-name").fill(bookA);
  await page.getByTestId("create-book").click();
  await expect(page.getByTestId("book-label")).toHaveText(bookA);
  await openStripboard(page);
  await expect(page.getByTestId("book-list")).toHaveValue(bookA);

  await page.getByTestId("ent-name").fill("阿福");
  await page.getByTestId("new-entity").click();
  await expect(page.getByTestId("ent-阿福")).toBeVisible();
  await page.getByTestId("ent-kind").selectOption("person");
  await page.getByTestId("ent-name").fill("阿莲");
  await page.getByTestId("new-entity").click();
  await page.getByTestId("ent-kind").selectOption("place");
  await page.getByTestId("ent-name").fill("渡口");
  await page.getByTestId("new-entity").click();
  await page.getByTestId("ent-kind").selectOption("rule");
  await page.getByTestId("ent-name").fill("开船须铜牌");
  await page.getByTestId("new-entity").click();
  await expect(page.getByTestId("ent-开船须铜牌")).toBeVisible();
  await expect(page.getByTestId("ent-开船须铜牌")).toHaveAttribute("draggable", "false");

  await page.getByTestId("intent").fill("阿莲在渡口");
  await page.getByTestId("place-id").fill("渡口");
  await page.getByTestId("write-next").click();
  await page.locator(".card.draft").first().waitFor();
  await page.locator(".card.draft").first().click();
  await page.locator('[data-testid="ent-阿莲"]').dragTo(page.locator(".card.draft").first());
  await page.getByTestId("do-text").fill("阿莲进门");
  await page.getByTestId("commit").click();
  await page.locator(".card.canon").first().waitFor({ timeout: 15000 });

  await page.getByTestId("density-mid").click();
  await expect(page.getByTestId("col-count")).toHaveText("4");
  for (let i = 0; i < 6; i++) {
    await page.getByTestId("add-column").click();
    await page.getByTestId("suggest-empty_col").click();
    await page.getByTestId("confirm-ok").click();
    await page.waitForTimeout(120);
  }

  await page.getByTestId("intent").fill("阿福上场");
  await page.getByTestId("write-next").click();
  await page.locator(".card.draft").first().waitFor();
  await page.locator(".card.draft").first().click();
  await page.locator('[data-testid="ent-阿福"]').dragTo(page.locator(".card.draft").first());

  const stWin = await page.evaluate(async () => {
    const st = await (await fetch("/api/state")).json();
    return { cols: (st.columns || []).length, start: st.window_start, n: st.n };
  });
  expect(stWin.cols).toBeGreaterThanOrEqual(7);
  expect(stWin.start).toBeGreaterThan(0);
  await expect(page.getByTestId("ent-阿莲")).toHaveCount(0);
  await expect(page.getByTestId("ent-阿福")).toBeVisible();

  await page.getByTestId("ent-search").fill("阿莲");
  await page.getByTestId("do-search").click();
  await expect(page.getByTestId("hit-阿莲")).toBeVisible();
  await expect(page.getByTestId("off-page-阿莲")).toHaveText("不在本页");
  await page.locator('[data-testid="hit-阿莲"]').dragTo(page.locator(".card.draft").first());
  await expect(page.getByTestId("chip-阿莲")).toBeVisible();

await page.locator('[data-testid="ent-开船须铜牌"]').dragTo(page.locator(".card.draft").first(), { timeout: 2000 }).catch(() => {});
  expect(await page.locator('[data-testid="chip-开船须铜牌"]').count()).toBe(0);
  const draftId = await page.evaluate(async () => {
    const st = await (await fetch("/api/state")).json();
    return st.selected || (st.drafts[0] && st.drafts[0].id);
  });
  const ruleRefuse = await page.evaluate(async (id) => {
    const r = await fetch("/api/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft_id: id, entity_id: "开船须铜牌", action: "add" }),
    });
    return { ok: r.ok, text: await r.text() };
  }, draftId);
  expect(ruleRefuse.ok).toBe(false);
  expect(ruleRefuse.text).toContain("规则不能拖进场");
  expect(await page.locator('[data-testid="chip-开船须铜牌"]').count()).toBe(0);

  await openMore(page);
  await page.getByTestId("occupancy").click();
  await closeMore(page);
  await expect(page.getByTestId("flyout")).toBeVisible();
  await expect(page.getByTestId("flyout-edit")).toHaveCount(0);
  await page.getByTestId("occ-阿莲-col0").click();
  const afterJump = await page.evaluate(async () => (await (await fetch("/api/state")).json()).window_start);
  expect(afterJump).toBe(0);
  const occPost = await page.evaluate(async () => {
    const r = await fetch("/api/occupancy", { method: "POST", body: "{}" });
    return { ok: r.ok, text: await r.text() };
  });
  expect(occPost.ok).toBe(false);
  expect(occPost.text).toContain("出场飞出层只读，改在场须拖标记");

  await page.getByTestId("book-name").fill(bookB);
  await page.getByTestId("create-book").click();
  await expect(page.getByTestId("book-label")).toHaveText(bookB);
  await page.getByTestId("ent-search").fill("阿莲");
  await page.getByTestId("do-search").click();
  await expect(page.getByTestId("search-empty")).toBeVisible();

  await page.getByTestId("book-list").selectOption(bookA);
  await expect(page.getByTestId("book-label")).toHaveText(bookA);
  await page.getByTestId("ent-search").fill("阿莲");
  await page.getByTestId("do-search").click();
  await expect(page.getByTestId("hit-阿莲")).toBeVisible();

  await page.getByTestId("intent").fill("贴两句对白");
  await expect(page.getByTestId("write-next")).toBeEnabled();
  await page.getByTestId("write-next").click();
  await page.locator(".card.draft").first().waitFor();
  await page.locator(".card.draft").first().click();
  await expect(page.getByTestId("say-text")).toHaveValue("");
  const committedBefore = await page.evaluate(async () => ((await (await fetch("/api/state")).json()).committed || []).length);
  await openMore(page);
  await page.getByTestId("paste").click();
  await closeMore(page);
  await expect(page.getByTestId("paste-dialog")).toBeVisible();
  await page.getByTestId("paste-text").fill("甲：你好。\n乙：在。");
  await page.getByTestId("paste-run").click();
  await expect(page.getByTestId("paste-dialog").getByTestId("paste-apply-paste0")).toBeVisible();
  await expect(page.getByTestId("say-text")).toHaveValue("");
  await expect(page.getByTestId("do-text")).toHaveValue("");
  await page.getByTestId("paste-dialog").getByTestId("paste-apply-paste0").click();
  await expect(page.getByTestId("say-text")).toHaveValue(/甲：你好/);
  const committedAfter = await page.evaluate(async () => ((await (await fetch("/api/state")).json()).committed || []).length);
  expect(committedAfter).toBe(committedBefore);
  await page.getByTestId("paste-close").click();
});

test("5 改已正史、删正史补洞、导出", async ({ page }) => {
  test.setTimeout(60000);
  const book = "ui-p5-" + Date.now();
  await page.goto("/");
  await page.getByTestId("book-name").fill(book);
  await page.getByTestId("create-book").click();
  await expect(page.getByTestId("book-label")).toHaveText(book);
  await openStripboard(page);
  await expect(page.getByTestId("delete-canon")).toBeDisabled();

  await page.getByTestId("ent-name").fill("阿福");
  await page.getByTestId("new-entity").click();
  await expect(page.getByTestId("ent-阿福")).toBeVisible();
  await page.getByTestId("ent-kind").selectOption("place");
  await page.getByTestId("ent-name").fill("渡口");
  await page.getByTestId("new-entity").click();

  await page.getByTestId("intent").fill("阿福发现刀");
  await page.getByTestId("place-id").fill("渡口");
  await page.getByTestId("write-next").click();
  await page.locator(".card.draft").first().waitFor();
  await page.locator(".card.draft").first().click();
  await page.locator('[data-testid="ent-阿福"]').dragTo(page.locator(".card.draft").first());
  await page.getByTestId("do-text").fill("打开抽屉看见刀");
  await page.getByTestId("say-text").fill("在这儿。");
  await page.getByTestId("commit").click();
  await page.locator(".card.canon").first().waitFor({ timeout: 15000 });

  await page.getByTestId("density-mid").click();
  await expect(page.getByTestId("col-count")).toHaveText("4");
  await page.getByTestId("intent").fill("阿莲来找");
  await page.getByTestId("write-next").click();
  await page.locator(".card.draft").first().waitFor();
  await page.locator(".card.draft").first().click();
  await page.getByTestId("do-text").fill("阿莲进门");
  await page.getByTestId("delta-ent").fill("刀");
  await page.getByTestId("delta-attr").fill("holder");
  await page.getByTestId("delta-val").fill("阿禾");
  await page.getByTestId("delta-from").fill("0");
  await page.getByTestId("add-delta").click();
  await page.getByTestId("commit").click();
  await expect(page.locator(".card.canon")).toHaveCount(2, { timeout: 15000 });

  const st0 = await page.evaluate(async () => (await (await fetch("/api/state")).json()));
  const b1 = (st0.committed || []).find((b: { intent: string }) => b.intent.includes("发现刀"));
  const b2 = (st0.committed || []).find((b: { intent: string }) => b.intent.includes("阿莲"));
  expect(b1.commit_seq).toBe(1);
  expect(b2.commit_seq).toBe(2);
  expect(b1.do_text).toContain("打开抽屉看见刀");

  await page.locator(`[data-testid="card-${b1.id}"]`).click();
  await expect(page.getByTestId("revise")).toBeVisible();
  await expect(page.getByTestId("delete-canon")).toBeEnabled();
  await expect(page.getByTestId("say-text")).toHaveValue(/在这儿/);
  await page.getByTestId("revise").click();
  await page.getByTestId("say-text").fill("不在这儿。");
  await page.getByTestId("revise").click();
  await expect(page.getByTestId("revise-msg")).toContainText("第几次写入正史仍是 1");

  const st1 = await page.evaluate(async () => (await (await fetch("/api/state")).json()));
  const r1 = (st1.committed || []).find((b: { id: string }) => b.id === b1.id);
  expect(r1.commit_seq).toBe(1);
  expect(r1.say_text).toContain("不在这儿");
  expect(r1.do_text).toContain("打开抽屉看见刀");
  const r2 = (st1.committed || []).find((b: { id: string }) => b.id === b2.id);
  expect(r2.do_text).toContain("阿莲进门");

  const world = await page.evaluate(async (t) => (await (await fetch("/api/world?t=" + t)).json()), b1.clock_from);
  const heard = JSON.stringify(world.knows || {});
  expect(heard).toContain("不在这儿");

  await page.locator(`[data-testid="card-${b1.id}"]`).click();
  await page.getByTestId("telling-ord").fill("2");
  await page.getByTestId("set-telling").click();
  await page.locator(`[data-testid="card-${b2.id}"]`).click();
  await page.getByTestId("telling-ord").fill("1");
  await page.getByTestId("set-telling").click();

  await openMore(page);
  await page.getByTestId("export").click();
  await closeMore(page);
  await expect(page.getByTestId("export-out")).toBeVisible();
  const mdStory = await page.getByTestId("export-out").innerText();
  expect(mdStory).toContain("状态：正史");
  expect(mdStory.indexOf("阿福发现刀")).toBeLessThan(mdStory.indexOf("阿莲来找"));
  expect(mdStory).not.toContain("状态：草稿");
  await page.getByTestId("export-close").click();

  await openMore(page);
  await page.getByTestId("reading-order").click();
  await closeMore(page);
  await expect(page.getByTestId("reading-order")).toHaveAttribute("aria-pressed", "true");
  await openMore(page);
  await page.getByTestId("export").click();
  await closeMore(page);
  await page.getByTestId("export-run").click();
  const mdRead = await page.getByTestId("export-out").innerText();
  expect(mdRead.indexOf("阿莲来找")).toBeLessThan(mdRead.indexOf("阿福发现刀"));
  const worldRead = await page.evaluate(async (t) => (await (await fetch("/api/world?t=" + t)).json()), b1.clock_from);
  expect(worldRead.t).toBe(b1.clock_from);
  expect(JSON.stringify(worldRead.knows || {})).toContain("不在这儿");
  await page.getByTestId("export-close").click();

  await page.getByTestId("intent").fill("未写入的草稿");
  await page.getByTestId("write-next").click();
  await page.locator(".card.draft").first().waitFor();
  await openMore(page);
  await page.getByTestId("export").click();
  await closeMore(page);
  await page.getByTestId("export-include-drafts").check();
  await page.getByTestId("export-run").click();
  await expect(page.getByTestId("export-out")).toContainText("状态：草稿");
  await page.getByTestId("export-include-drafts").setChecked(false);
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/export") && r.url().includes("canon_only=1")),
    page.getByTestId("export-run").click(),
  ]);
  const mdCanon = await page.getByTestId("export-out").innerText();
  expect(mdCanon).toContain("状态：正史");
  expect(mdCanon).not.toContain("状态：草稿");
  await page.getByTestId("export-close").click();
  const afterFile = await page.evaluate(async () => (await (await fetch("/api/state")).json()).committed.map((b: { id: string; commit_seq: number }) => ({ id: b.id, seq: b.commit_seq })));
  expect(afterFile.some((b: { seq: number }) => b.seq === 1)).toBeTruthy();

  await page.locator(`[data-testid="card-${b1.id}"]`).click();
  await page.getByTestId("delete-canon").click();
  await expect(page.getByTestId("confirm-change")).toBeVisible();
  const impacts = await page.getByTestId("impact-list").innerText();
  expect(impacts).toContain("故事时间空洞");
  expect(impacts).toContain("seq=1");
  expect(impacts).not.toBe(
    "故事时间空洞\n后续场规定情境\n知情\n伏笔状态\n在场连续性\n算出这一刻\n第几次写入正史不重编号 / 该次写入作废"
  );
  for (const k of ["empty_beat", "ellipsis", "extend_neighbor", "shift", "leave_hole", "cancel"]) {
    await expect(page.getByTestId("suggest-" + k)).toBeVisible();
  }
  await page.getByTestId("suggest-shift").click();
  await page.getByTestId("confirm-ok").click();
  await expect(page.getByTestId("confirm-change")).toBeHidden();

  const st2 = await page.evaluate(async () => (await (await fetch("/api/state")).json()));
  const left = (st2.committed || []).filter((b: { status?: string }) => !b.status || b.status === "committed");
  expect(left.some((b: { id: string }) => b.id === b1.id)).toBeFalsy();
  const remain = left.find((b: { id: string }) => b.id === b2.id);
  expect(remain.commit_seq).toBe(2);
  const cols = (st2.columns || []).slice().sort((a: { clock_from: number }, b: { clock_from: number }) => a.clock_from - b.clock_from);
  for (let i = 0; i < cols.length - 1; i++) {
    expect(cols[i].clock_to).toBeLessThanOrEqual(cols[i + 1].clock_from);
  }
  expect(cols[0].clock_from).toBe(0);
  await expect(page.getByTestId("delete-canon")).toBeDisabled();
});




