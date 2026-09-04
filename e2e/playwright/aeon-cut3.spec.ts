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

async function makeEnt(page: Page, kind: string, name: string) {
  await page.getByTestId("ent-kind").selectOption(kind);
  await page.getByTestId("ent-name").fill(name);
  await page.getByTestId("new-entity").click();
  await expect(page.getByTestId("ent-" + name)).toBeVisible();
}

async function writeDraft(page: Page, intent: string) {
  return writeDraftBar(page, intent);
}

async function st(page: Page) {
  return page.evaluate(async () => (await (await fetch("/api/state")).json()));
}

async function lastDraft(page: Page) {
  const s = await st(page);
  const drafts = s.drafts || [];
  const d = drafts[drafts.length - 1];
  if (!d) throw new Error("无草稿");
  return d;
}

async function reloadBook(page: Page, book: string) {
  await page.reload();
  await waitBookLabel(page, book);
}

test("总表草稿和正史都能改本场任务", async ({ page }) => {
  const book = "cut3-table-" + Date.now();
  await boot(page, book);
  await writeDraft(page, "第一场草稿");
  const draft = await lastDraft(page);
  await page.evaluate(async (id) => {
    await fetch("/api/drafts/patch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, do_text: "走了一步" }),
    });
    await fetch("/api/commit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
  }, draft.id);
  await reloadBook(page, book);
  await writeDraft(page, "还是草稿");
  const keep = await lastDraft(page);
  await openWorkspaceTab(page, "总表");
  await expect(page.getByTestId("table-view")).toBeVisible();
  await expect(page.getByTestId("table-body")).toContainText("正史");
  await expect(page.getByTestId("table-body")).toContainText("草稿");
  await page.getByTestId("table-intent-" + draft.id).fill("正史改了任务");
  await page.getByTestId("table-intent-" + draft.id).blur();
  await page.getByTestId("table-intent-" + keep.id).fill("草稿改了任务");
  await page.getByTestId("table-intent-" + keep.id).blur();
  await expect.poll(async () => {
    const s = await st(page);
    const canon = (s.committed || []).find((b: { id: string }) => b.id === draft.id);
    const d = (s.drafts || []).find((x: { id: string }) => x.id === keep.id);
    return [canon?.intent, d?.draft?.intent];
  }).toEqual(["正史改了任务", "草稿改了任务"]);
});

test("总表批量改读序即时生效，⌘Z 能撤", async ({ page }) => {
  const book = "cut3-batch-" + Date.now();
  await boot(page, book);
  await writeDraft(page, "甲");
  const a = await lastDraft(page);
  await writeDraft(page, "乙");
  const b = await lastDraft(page);
  await openWorkspaceTab(page, "总表");
  await page.getByTestId("table-telling-" + a.id).fill("9");
  await page.getByTestId("table-telling-" + a.id).blur();
  await page.getByTestId("table-telling-" + b.id).fill("8");
  await page.getByTestId("table-telling-" + b.id).blur();
  await expect.poll(async () => {
    const s = await st(page);
    const da = (s.drafts || []).find((x: { id: string }) => x.id === a.id);
    const db = (s.drafts || []).find((x: { id: string }) => x.id === b.id);
    return [da?.draft?.telling_ord, db?.draft?.telling_ord];
  }).toEqual([9, 8]);
  await page.getByTestId("table-check-" + a.id).check();
  await page.getByTestId("table-check-" + b.id).check();
  await page.getByTestId("table-batch-telling").click();
  await expect.poll(async () => {
    const s = await st(page);
    const da = (s.drafts || []).find((x: { id: string }) => x.id === a.id);
    const db = (s.drafts || []).find((x: { id: string }) => x.id === b.id);
    return [da?.draft?.telling_ord, db?.draft?.telling_ord];
  }).toEqual([1, 2]);
  await page.locator("body").click({ position: { x: 8, y: 8 } });
  await page.keyboard.press("Control+z");
  await expect.poll(async () => {
    const s = await st(page);
    const da = (s.drafts || []).find((x: { id: string }) => x.id === a.id);
    const db = (s.drafts || []).find((x: { id: string }) => x.id === b.id);
    return [da?.draft?.telling_ord, db?.draft?.telling_ord];
  }).toEqual([9, 8]);
});

test("关系格点格给草稿加上在场，再点拿掉", async ({ page }) => {
  const book = "cut3-rel-" + Date.now();
  await boot(page, book);
  await makeEnt(page, "person", "阿禾");
  await makeEnt(page, "person", "阿莲");
  await writeDraft(page, "阿禾出门");
  const d = await lastDraft(page);
  await page.evaluate(async (id) => {
    await fetch("/api/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft_id: id, entity_id: "阿禾", action: "add" }),
    });
  }, d.id);
  await reloadBook(page, book);
  await openWorkspaceTab(page, "关系");
  await expect(page.getByTestId("look-relations-panel")).toBeVisible();
  await expect(page.getByTestId(`rel-cell-${d.id}-阿禾`)).toContainText("在");
  const cell = page.getByTestId(`rel-cell-${d.id}-阿莲`);
  await expect(cell).toContainText("·");
  await cell.click();
  await expect(cell).toContainText("在");
  await cell.click();
  await expect(cell).toContainText("·");
  await expect(page.getByTestId(`rel-cell-${d.id}-阿禾`)).toContainText("在");
});

test("关系格只读这场年龄", async ({ page }) => {
  const book = "cut3-age-" + Date.now();
  await boot(page, book);
  await makeEnt(page, "person", "阿禾");
  await page.getByTestId("ent-阿禾").click();
  await expect(page.getByTestId("dossier")).toBeVisible();
  const expand = page.getByRole("button", { name: /展开全部/ });
  if (await expand.count()) await expand.click();
  await page.getByTestId("dossier-born_clock").fill("0");
  await page.getByTestId("dossier-save").click();
  await page.getByTestId("dossier-close").click();
  await writeDraft(page, "阿禾出门");
  const d = await lastDraft(page);
  await page.evaluate(async (id) => {
    await fetch("/api/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft_id: id, entity_id: "阿禾", action: "add" }),
    });
  }, d.id);
  await reloadBook(page, book);
  await openWorkspaceTab(page, "关系");
  await expect(page.getByTestId(`rel-age-${d.id}-阿禾`)).toContainText("分钟大");
});

test("关系格切到人×人能加点关系", async ({ page }) => {
  const book = "cut3-pp-" + Date.now();
  await boot(page, book);
  await makeEnt(page, "person", "阿禾");
  await makeEnt(page, "person", "阿莲");
  await openWorkspaceTab(page, "关系");
  await page.getByTestId("rel-mode-people").click();
  await expect(page.getByTestId("rel-people-grid")).toBeVisible();
  const cell = page.getByTestId("rel-people-阿禾-阿莲");
  await expect(cell).toHaveText("·");
  await cell.click();
  await expect(cell).toHaveText("有");
});

test("轨迹按人有阿禾一行，拖到阿莲轨加上在场不离开原轨", async ({ page }) => {
  const book = "cut3-sub-" + Date.now();
  await boot(page, book);
  await makeEnt(page, "person", "阿禾");
  await makeEnt(page, "person", "阿莲");
  await writeDraft(page, "阿禾在城里等信");
  const d = await lastDraft(page);
  await page.evaluate(async (id) => {
    await fetch("/api/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft_id: id, entity_id: "阿禾", action: "add" }),
    });
  }, d.id);
  await reloadBook(page, book);
  await openWorkspaceTab(page, "轨迹");
  await expect(page.getByTestId("look-track")).toBeVisible();
  await page.getByTestId("subway-mode-person").click();
  await expect(page.getByTestId("subway-lane-阿禾")).toBeVisible();
  await expect(page.getByTestId("subway-lane-阿莲")).toBeVisible();
  await page.getByTestId(`subway-node-${d.id}`).dragTo(page.getByTestId("subway-drop-阿莲"));
  await expect.poll(async () => {
    const s = await st(page);
    const draft = (s.drafts || []).find((x: { id: string }) => x.id === d.id);
    const ids = ((draft?.draft?.presences) || []).map((p: { entity_id: string }) => p.entity_id);
    return ids;
  }).toEqual(expect.arrayContaining(["阿禾", "阿莲"]));
});

test("轨迹切到逻辑线轨，进度是布局选项", async ({ page }) => {
  const book = "cut3-line-" + Date.now();
  await boot(page, book);
  await writeDraft(page, "一场");
  await page.evaluate(async () => {
    const t = await (await fetch("/api/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "铜牌", type: "支线" }),
    })).json();
    const s = await (await fetch("/api/state")).json();
    const d = (s.drafts || [])[0];
    if (d && t.id) {
      await fetch("/api/drafts/patch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: d.id, story_threads: [{ id: t.id, role: "推进" }] }),
      });
    }
  });
  await reloadBook(page, book);
  await openWorkspaceTab(page, "轨迹");
  await page.getByTestId("subway-mode-line").click();
  await expect(page.getByTestId("subway-lane-铜牌")).toBeVisible();
  await expect(page.getByTestId("look-progress")).toHaveCount(0);
  await page.getByTestId("subway-layout-progress").click();
  await expect(page.getByTestId("look-progress")).toBeVisible();
});

test("关系页签能打开出场表布局，默认不是单独页签", async ({ page }) => {
  const book = "cut3-occ-" + Date.now();
  await boot(page, book);
  await makeEnt(page, "person", "阿禾");
  await openWorkspaceTab(page, "关系");
  await expect(page.getByTestId("tab-关系")).toBeVisible();
  await expect(page.getByTestId("tab-出场")).toHaveCount(0);
  await expect(page.getByTestId("flyout")).toHaveCount(0);
  await page.getByTestId("rel-layout-occ").click();
  await expect(page.getByTestId("flyout")).toBeVisible();
});
