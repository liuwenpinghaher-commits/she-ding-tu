import { expect } from "@playwright/test";
import { clickOpsAction, openOpsMenu, openStripboard, openWorkspaceTab, selectDraftCard, test, waitBookLabel } from "./helpers";

test.describe.configure({ timeout: 120000 });

async function createBook(page: import("@playwright/test").Page, name: string) {
  await page.goto("/");
  await page.getByTestId("book-name").fill(name);
  await page.getByTestId("create-book").click();
  await waitBookLabel(page, name);
  await openStripboard(page);
}

test("R1 点正史场六块显示这一刻", async ({ page }) => {
  const book = "r1-sit-" + Date.now();
  await createBook(page, book);
  await page.getByTestId("intent").fill("阿福拉开抽屉");
  await page.getByTestId("write-next").click();
  await selectDraftCard(page);
  await page.getByTestId("do-text").fill("拉开抽屉看见刀。");
  await page.getByTestId("commit").click();
  await page.locator(".card.canon").first().waitFor({ timeout: 15000 });
  await page.locator(".card.canon").first().click();
  await expect(page.getByTestId("sit-task")).toContainText("阿福拉开抽屉");
  await page.getByTestId("ruler-col-0").click();
  await expect(page.getByTestId("sit-blocks")).toBeVisible();
  await expect(page.getByTestId("sit-task")).not.toHaveText(/本场任务\s*还没有$/);
});

test("R2 无伏笔建议时不画可见空壳", async ({ page }) => {
  const book = "r2-sug-" + Date.now();
  await createBook(page, book);
  await expect(page.getByTestId("promise-suggest")).toHaveAttribute("aria-hidden", "true");
});

test("R3 commit 前看见世界账空的人话黄条", async ({ page }) => {
  const book = "r3-gap-" + Date.now();
  await createBook(page, book);
  await page.getByTestId("intent").fill("把信交出去");
  await page.getByTestId("write-next").click();
  await selectDraftCard(page);
  await expect(page.getByTestId("commit-empty-world")).toBeVisible();
  await expect(page.getByTestId("commit-empty-world")).toContainText("世界账还是空的");
  await expect(page.getByTestId("commit")).toBeEnabled();
});

test("R4 本页列数钳在 1-6", async ({ page }) => {
  const book = "r4-n-" + Date.now();
  await createBook(page, book);
  await page.getByTestId("density-dense").click();
  await expect(page.getByTestId("col-count")).toHaveText("6");
  await expect(page.getByTestId("plus")).toBeDisabled();
  const clamped = await page.evaluate(async () => {
    const r = await fetch("/api/window", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ n: 9 }),
    });
    return r.json();
  });
  expect(clamped.n).toBe(6);
});

test("R5 总表改正史动作须改这一场；读序可以轻", async ({ page }) => {
  const book = "r5-gate-" + Date.now();
  await createBook(page, book);
  await page.getByTestId("intent").fill("阿禾等信");
  await page.getByTestId("write-next").click();
  await selectDraftCard(page);
  await page.getByTestId("do-text").fill("靠着门框。");
  await page.getByTestId("commit").click();
  await expect.poll(async () => {
    const st = await page.evaluate(async () => (await (await fetch("/api/state")).json()));
    return (st.committed || []).length;
  }, { timeout: 20000 }).toBe(1);
  const st = await page.evaluate(async () => (await (await fetch("/api/state")).json()));
  const id = st.committed[0].id as string;
  await openWorkspaceTab(page, "总表");
  await expect(page.getByTestId("table-view")).toBeVisible();
  await expect(page.getByTestId(`table-do-${id}`)).toHaveAttribute("readonly", "");
  await expect(page.getByTestId(`table-edit-${id}`)).toBeVisible();
  await page.getByTestId(`table-telling-${id}`).fill("3");
  await page.getByTestId(`table-telling-${id}`).blur();
  await expect.poll(async () => {
    const s2 = await page.evaluate(async () => (await (await fetch("/api/state")).json()));
    return s2.committed[0].telling_ord;
  }).toBe(3);
});

test("R6 正史加在场走确认变更", async ({ page }) => {
  const book = "r6-add-" + Date.now();
  await createBook(page, book);
  await page.getByTestId("ent-name").fill("阿福");
  await page.getByTestId("new-entity").click();
  await page.getByTestId("intent").fill("阿福进仓");
  await page.getByTestId("write-next").click();
  await selectDraftCard(page);
  await page.getByTestId("do-text").fill("进仓。");
  await page.getByTestId("commit").click();
  await expect.poll(async () => {
    const st = await page.evaluate(async () => (await (await fetch("/api/state")).json()));
    return (st.committed || []).length;
  }, { timeout: 20000 }).toBe(1);
  const st = await page.evaluate(async () => (await (await fetch("/api/state")).json()));
  const beatId = st.committed[0].id as string;
  const r = await page.evaluate(async ({ beatId }) => {
    const res = await fetch("/api/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ canon_id: beatId, entity_id: "阿福", action: "add" }),
    });
    return { status: res.status, body: await res.json() };
  }, { beatId });
  expect(r.status).toBe(200);
  expect(r.body.need_confirm).toBeTruthy();
  await page.reload();
  await waitBookLabel(page, book);
  await expect(page.getByTestId("confirm-change")).toBeVisible();
  await expect(page.getByTestId("impact-list")).toContainText("在场连续性");
});

test("R7 写下一场占新列 toast 说明", async ({ page }) => {
  const book = "r7-col-" + Date.now();
  await createBook(page, book);
  await page.getByTestId("intent").fill("第一场");
  await page.getByTestId("write-next").click();
  await selectDraftCard(page);
  await page.getByTestId("do-text").fill("第一场动作。");
  await page.getByTestId("commit").click();
  await page.locator(".card.canon").first().waitFor({ timeout: 15000 });
  await page.getByTestId("intent").fill("第二场往后");
  await page.getByTestId("write-next").click();
  await expect(page.getByTestId("undo-toast")).toContainText("在最后加了一列草稿，还不是正史");
});

test("R8 门厅卸掉写戏壳", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("write-next")).toBeHidden();
  await expect(page.getByTestId("window-widget")).toBeHidden();
  await page.getByTestId("shelf-new").click();
  await expect(page.getByTestId("nb-name")).toBeVisible();
  await expect(page.getByTestId("write-next")).toBeHidden();
  await expect(page.getByTestId("window-widget")).toBeHidden();
});

test("R9 模型 503 映射人话", async ({ page }) => {
  const book = "r9-llm-" + Date.now();
  await createBook(page, book);
  await page.getByTestId("intent").fill("阿福发现刀");
  await page.getByTestId("write-next").click();
  await selectDraftCard(page);
  await page.getByTestId("fill-live").click();
  await expect(page.getByTestId("op-error")).toContainText("没配模型密钥，可以手写动作");
});

test("R10 铺场中间落下先确认变更", async ({ page }) => {
  const book = "r10-mid-" + Date.now();
  await createBook(page, book);
  const preview = await page.evaluate(async () => {
    const res = await fetch("/api/structure/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "plan_mid" }),
    });
    return { status: res.status, body: await res.json() };
  });
  expect(preview.status).toBe(200);
  expect(preview.body.op).toBe("plan_mid");
  await page.reload();
  await waitBookLabel(page, book);
  await expect(page.getByTestId("confirm-change")).toBeVisible();
  await expect(page.getByTestId("impact-list")).toContainText("中间加列");
});

test("R11 粘贴建议标目标字段", async ({ page }) => {
  const book = "r11-paste-" + Date.now();
  await createBook(page, book);
  await page.getByTestId("intent").fill("拆开这一段");
  await page.getByTestId("write-next").click();
  await selectDraftCard(page);
  await page.getByTestId("paste").click();
  await page.getByTestId("paste-text").fill("阿莲蹲下拉开抽屉。\n阿福说：刀在里面。");
  await page.getByTestId("paste-run").click();
  const btn = page.getByTestId("paste-apply-paste0");
  await expect(btn).toBeVisible();
  await expect(btn).toContainText("放到");
  await expect(btn).toContainText(/动作|对白/);
});

test("R12 commit 后再点同一草稿不插回", async ({ page }) => {
  const book = "r12-idemp-" + Date.now();
  await createBook(page, book);
  await page.getByTestId("intent").fill("只写一次");
  await page.getByTestId("write-next").click();
  await selectDraftCard(page);
  await page.getByTestId("do-text").fill("写完。");
  const draftId = await page.evaluate(async () => {
    const st = await (await fetch("/api/state")).json();
    return st.selected;
  });
  await page.getByTestId("commit").click();
  await expect.poll(async () => {
    const st = await page.evaluate(async () => (await (await fetch("/api/state")).json()));
    return (st.committed || []).length;
  }, { timeout: 20000 }).toBe(1);
  const again = await page.evaluate(async (id) => {
    const res = await fetch("/api/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const text = await res.text();
    const st = await (await fetch("/api/state")).json();
    return { status: res.status, text, drafts: (st.drafts || []).length, committed: (st.committed || []).length };
  }, draftId);
  expect(again.status).toBe(400);
  expect(again.text).toContain("无此草稿");
  expect(again.committed).toBe(1);
  expect(again.drafts).toBe(0);
});

test("R13 连线图选中人才画只读边", async ({ page }) => {
  const book = "r13-graph-" + Date.now();
  await createBook(page, book);
  await page.getByTestId("ent-name").fill("阿禾");
  await page.getByTestId("new-entity").click();
  await openOpsMenu(page);
  await page.getByRole("button", { name: "连线" }).click();
  await expect(page.getByTestId("graph-view")).toBeVisible();
  await expect(page.getByTestId("graph-view")).toContainText("选中一个人物才画连线");
  await page.getByTestId("person-lens").selectOption({ label: "阿禾" }, { force: true });
  await expect(page.getByTestId("graph-svg")).toBeVisible();
});

test("R14 打开书记住上次页签，无 stored 默认分场条", async ({ page }) => {
  const book = "r14-tab-" + Date.now();
  await createBook(page, book);
  await expect(page.getByTestId("stripboard")).toBeVisible();
  await page.getByTestId("open-timeline").click();
  await expect(page.getByTestId("timeline")).toBeVisible();
  await page.reload();
  await waitBookLabel(page, book);
  await expect(page.getByTestId("timeline")).toBeVisible();
  const book2 = "r14-fresh-" + Date.now();
  await page.getByTestId("book-name").fill(book2);
  await page.getByTestId("create-book").click();
  await waitBookLabel(page, book2);
  await expect(page.getByTestId("stripboard")).toBeVisible();
});

test("R15 导出命令伏笔进三点菜单，⌘K 仍在", async ({ page }) => {
  const book = "r15-top-" + Date.now();
  await createBook(page, book);
  const inQuick = await page.getByTestId("quick-actions").getByTestId("export").count();
  expect(inQuick).toBe(0);
  await expect(page.getByTestId("write-next")).toBeVisible();
  await expect(page.getByTestId("window-widget")).toBeVisible();
  await expect(page.getByTestId("intent")).toBeVisible();
  await openOpsMenu(page);
  await expect(page.getByTestId("export")).toBeVisible();
  await expect(page.getByTestId("open-cmd")).toBeVisible();
  await expect(page.getByTestId("plant-promise")).toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(page.getByTestId("cmd-palette")).toBeVisible();
});

test("R16 本场任务显示人物渴望旁注", async ({ page }) => {
  const book = "r16-desire-" + Date.now();
  await createBook(page, book);
  await page.evaluate(async () => {
    await fetch("/api/entities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "阿莲", kind: "person", name: "阿莲", profile: { desire: "过河" } }),
    });
  });
  await page.getByTestId("intent").fill("阿莲要过河");
  await page.getByTestId("write-next").click();
  await selectDraftCard(page);
  await page.evaluate(async () => {
    const st = await (await fetch("/api/state")).json();
    await fetch("/api/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft_id: st.selected, entity_id: "阿莲", action: "add" }),
    });
  });
  await page.reload();
  await waitBookLabel(page, book);
  await page.locator(".card.draft").first().click();
  await expect(page.getByTestId("sit-desire")).toContainText("过河");
  await expect(page.getByTestId("sit-three-q")).toContainText("这场要什么");
  await expect(page.getByTestId("sit-three-q")).toContainText("过河");
});
