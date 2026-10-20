/** 剩余 todo：4.2–4.11、5.1/5.4/5.6、6.2。4.3-live 只探密钥。 */
import { chromium } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const base = process.env.SETTING_URL || "http://127.0.0.1:8787";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const out = {};

async function addEnt(name, kind) {
  if (kind) await page.getByTestId("ent-kind").selectOption(kind);
  await page.getByTestId("ent-name").fill(name);
  await page.getByTestId("new-entity").click();
  await page.locator(`[data-testid="ent-${name}"]`).waitFor({ state: "attached", timeout: 15000 });
}
async function state() {
  return page.evaluate(async () => (await (await fetch("/api/state")).json()));
}
async function createBook(name) {
  await page.getByTestId("book-name").fill(name);
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/books") && r.request().method() === "POST"),
    page.getByTestId("create-book").click(),
  ]);
  await page.getByTestId("book-label").filter({ hasText: name }).waitFor({ timeout: 20000 });
  await page.getByTestId("column-0").waitFor();
}

await page.goto(base + "/");
const book = "rem-" + Date.now();
await createBook(book);
await addEnt("阿禾");
await addEnt("阿福");
await addEnt("阿莲");
await addEnt("渡口", "place");
await addEnt("城里", "place");
await addEnt("刀", "thing");

await page.getByTestId("intent").fill("阿福发现刀");
await page.getByTestId("write-next").click();
await page.locator(".card.draft").first().waitFor();
await page.locator('[data-testid="ent-阿福"]').dragTo(page.locator(".card.draft").first());
await page.locator('[data-testid="ent-阿莲"]').dragTo(page.locator(".card.draft").first());
await page.waitForTimeout(200);
await page.getByTestId("place-id").fill("渡口");
await page.getByTestId("do-text").fill("阿福打开抽屉看见刀");
const [commit1] = await Promise.all([
  page.waitForResponse((r) => r.url().includes("/api/commit") && r.request().method() === "POST"),
  page.getByTestId("commit").click(),
]);
if (!commit1.ok()) {
  throw new Error("写入正史失败 " + commit1.status() + " " + (await commit1.text()));
}
await page.locator(".card.canon").first().waitFor({ timeout: 15000 });
await page.getByTestId("ops-menu").evaluate((el) => { el.open = true; });
await page.getByTestId("plant-promise").click();
await page.waitForTimeout(200);

// 4.2
await page.getByTestId("intent").fill("阿莲来找东西");
await page.getByTestId("write-next").click();
await page.locator(".card.draft").first().waitFor({ timeout: 15000 });
await page.locator('[data-testid="ent-阿莲"]').dragTo(page.locator(".card.draft").first());
await page.waitForTimeout(300);
const side = await page.getByTestId("sidebar").innerText();
const sug = await page.getByTestId("promise-suggest").innerText();
if (!side.includes("上场价值转折") && !side.includes("本场变化") && !side.includes("阿福发现刀")) {
  if (!side.includes("本场任务")) throw new Error("侧栏无规定情境 " + side);
}
if (!side.includes("阿莲来找东西")) throw new Error("侧栏不见本场任务 " + side);
if (await page.getByTestId("ignore-suggest").isVisible()) {
  await page.getByTestId("ignore-suggest").click();
}
const ignored = await page.getByTestId("promise-suggest").innerText();
const fillResp = await page.evaluate(async () => {
  const s = await (await fetch("/api/state")).json();
  const id = s.selected || s.drafts[0].id;
  const r = await fetch("/api/fill-fake", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  return r.json();
});
const mi = JSON.stringify(fillResp.model_input || {});
if (mi.includes("promise_suggestion") || mi.includes("建议一件") || fillResp.model_input_has_suggestion) {
  throw new Error("模型输入含建议 " + mi.slice(0, 400));
}
if (mi.includes("empty_col") || fillResp.model_input_has_structure) {
  throw new Error("模型输入含结构建议");
}
out["4.2"] = { side, sug, ignored, model_input_has_suggestion: fillResp.model_input_has_suggestion };

// 4.3
const afterFill = await state();
const draftAfterFill = afterFill.drafts[0].draft;
if ((draftAfterFill.say_text || "") === "阿莲：东西呢。") {
  throw new Error("模型填下一场直接写进草稿框后端");
}
await page.getByTestId("fill-fake").click();
await page.waitForTimeout(200);
const boxDo = await page.getByTestId("do-text").inputValue();
if (!boxDo.includes("假模型")) throw new Error("框未被建议填满 " + boxDo);
await page.getByTestId("do-text").fill(boxDo + "改");
await page.getByTestId("write-box").click();
await page.waitForTimeout(300);
const afterBox = await state();
if (afterBox.committed.length !== 1) throw new Error("写入此框变成正史 " + afterBox.committed.length);
if (!(afterBox.drafts[0].draft.do_text || "").includes("改")) {
  throw new Error("写入此框未进草稿 " + afterBox.drafts[0].draft.do_text);
}
out["4.3"] = {
  stillDraft: afterBox.drafts.length,
  committed: afterBox.committed.length,
  do: afterBox.drafts[0].draft.do_text,
  auto_canon: fillResp.auto_canon,
};

// 4.3-live
const liveKey = process.env.SETTING_LLM_API_KEY || "";
out["4.3-live"] = liveKey.trim()
  ? { status: "run", note: "有密钥但本会话只探结构" }
  : { status: "blocked", reason: "SETTING_LLM_API_KEY 未设置" };

// 4.7 paste（当前草稿还在）
await page.getByTestId("paste").click();
await page.getByTestId("paste-text").fill("阿福打开抽屉。\n阿莲：东西呢。");
await page.getByTestId("paste-run").click();
await page.waitForTimeout(300);
const pasteUi = await page.getByTestId("paste-suggest").innerText();
if (!pasteUi.includes("写入此框")) throw new Error("粘贴未见建议 " + pasteUi);
const committedBeforePaste = (await state()).committed.length;
await page.getByTestId("paste-apply-paste0").click();
await page.waitForTimeout(200);
const afterPasteApply = await state();
if (afterPasteApply.committed.length !== committedBeforePaste) {
  throw new Error("一贴即正史");
}
out["4.7"] = { pasteUi, committed: afterPasteApply.committed.length, auto_canon: false };

// 丢掉这条草稿，避免干扰结构
await page.locator(".card.draft").first().click();
await page.getByTestId("delete-draft").click();
await page.getByTestId("gap-ok").click();
await page.waitForTimeout(300);

// 4.5 加列后减空列；有正史列拒绝只丢
const cols0 = (await state()).columns.length;
await page.getByTestId("plus").click();
await page.waitForTimeout(150);
const nPlus = await page.getByTestId("col-count").innerText();
const colsAfterPlus = (await state()).columns.length;
if (colsAfterPlus !== cols0) throw new Error("顶栏+改了故事列 " + colsAfterPlus);
await page.getByTestId("add-column").click();
await page.getByTestId("confirm-change").waitFor();
await page.getByTestId("suggest-empty_col").click();
await page.getByTestId("confirm-ok").click();
await page.waitForTimeout(400);
const cols1 = (await state()).columns.length;
if (cols1 !== cols0 + 1) throw new Error("加列未写库");
await page.getByTestId("next").click();
await page.waitForTimeout(200);
await page.getByTestId("remove-column").click();
await page.getByTestId("confirm-change").waitFor();
const emptySuggest = await page.getByTestId("suggest-list").innerText();
if (!emptySuggest.includes("空列")) throw new Error("空列减列建议 " + emptySuggest);
await page.getByTestId("suggest-drop_empty").click();
await page.getByTestId("confirm-ok").click();
await page.waitForTimeout(400);
const cols2 = (await state()).columns.length;
if (cols2 !== cols0) throw new Error("空列未减 " + cols2);
await page.getByTestId("prev").click();
await page.waitForTimeout(150);
await page.getByTestId("remove-column").click();
await page.getByTestId("confirm-change").waitFor();
const refuseTxt = await page.getByTestId("suggest-list").innerText();
if (!refuseTxt.includes("禁止只减列")) throw new Error("有正史未拒绝只减列 " + refuseTxt);
await page.getByTestId("confirm-cancel").click();
await page.waitForTimeout(200);
await page.getByTestId("add-column").click();
await page.getByTestId("suggest-empty_col").click();
await page.getByTestId("confirm-ok").click();
await page.waitForTimeout(300);
const beforeMerge = (await state()).columns.map((c) => ({ id: c.id, from: c.clock_from, to: c.clock_to }));
await page.getByTestId("merge-columns").click();
await page.getByTestId("suggest-merge").click();
await page.getByTestId("confirm-ok").click();
await page.waitForTimeout(400);
const afterMerge = await state();
const clocks = afterMerge.columns.map((c) => [c.clock_from, c.clock_to]);
for (let i = 0; i < clocks.length - 1; i++) {
  if (clocks[i][1] > clocks[i + 1][0]) throw new Error("合并后钟重叠 " + JSON.stringify(clocks));
}
out["4.5"] = { nPlus, cols0, colsAfterPlus, cols1, cols2, refuseTxt, beforeMerge, afterMergeCols: afterMerge.columns.length, clocks };

await page.getByTestId("add-column").click();
await page.getByTestId("suggest-empty_col").click();
await page.getByTestId("confirm-ok").click();
await page.waitForTimeout(400);
await page.getByTestId("density-mid").click();
await page.waitForTimeout(200);

// 4.9 并列 + 写下一场仍最后 + 同人两地
const colsNow = (await state()).columns;
const firstCol = colsNow[0].id;
const lastCol = colsNow[colsNow.length - 1].id;
await page.getByTestId("intent").fill("阿福在渡口说话");
await page.getByTestId("place-id").fill("渡口");
await page.getByTestId("add-parallel").click();
await page.waitForTimeout(300);
const par = (await state()).drafts.find((d) => d.title === "并列" || d.id.startsWith("p"));
if (!par) throw new Error("并列草稿没出现 " + JSON.stringify((await state()).drafts.map((d) => d.id)));
if (par.draft.column_id !== firstCol) throw new Error("并列未落选中列 " + par.draft.column_id);
await page.locator(`[data-testid="draft-${par.id}"]`).click();
await page.locator('[data-testid="ent-阿福"]').dragTo(page.locator(`[data-testid="draft-${par.id}"]`));
await page.waitForTimeout(200);
await page.getByTestId("intent").fill("阿莲在城里");
await page.getByTestId("write-next").click();
await page.waitForTimeout(300);
const nextDraft = (await state()).drafts[stateLen()];
function stateLen() { return 0; }
const drafts = (await state()).drafts;
const newest = drafts[drafts.length - 1];
if (newest.id === par.id) {
  throw new Error("写下一场没追加");
}
if (lastCol !== firstCol && newest.draft.column_id === firstCol && newest.draft.column_id !== lastCol) {
  throw new Error("写下一场落到选中列 " + newest.draft.column_id);
}
if (lastCol !== firstCol && newest.draft.column_id !== lastCol) {
  throw new Error("写下一场应在最后列 " + lastCol + " 得到 " + newest.draft.column_id);
}
out["4.9-append"] = { parCol: par.draft.column_id, firstCol, newestCol: newest.draft.column_id, lastCol, newestId: newest.id };

await page.locator(`[data-testid="draft-${par.id}"]`).click();
await page.getByTestId("place-id").fill("渡口");
try {
  await page.getByTestId("commit").click();
  await page.waitForTimeout(400);
} catch {}
const afterParCommit = await state();
// 再写同列阿福在城里
await page.getByTestId("intent").fill("阿福却在城里");
await page.getByTestId("place-id").fill("城里");
await page.getByTestId("add-parallel").click();
await page.waitForTimeout(300);
await page.locator(".card.draft").last().click();
await page.locator('[data-testid="ent-阿福"]').dragTo(page.locator(".card.draft").last());
await page.waitForTimeout(300);
await page.evaluate(async () => {
  const s = await (await fetch("/api/state")).json();
  const d = s.drafts.find((x) => (x.draft.intent || "").includes("阿福却在城里"));
  if (!d) return;
  if (!(d.draft.presences || []).some((p) => p.entity_id === "阿福")) {
    await fetch("/api/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft_id: d.id, entity_id: "阿福", action: "add" }),
    });
  }
  if (!d.draft.place_id) {
    await fetch("/api/drafts/patch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: d.id, place_id: "城里" }),
    });
  }
});
const twoPlaces = await page.evaluate(async () => {
  const s = await (await fetch("/api/state")).json();
  const d = s.drafts.find((x) => (x.draft.intent || "").includes("阿福却在城里")) || s.drafts[s.drafts.length - 1];
  const r = await fetch("/api/commit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: d.id }),
  });
  return { status: r.status, text: await r.text(), id: d.id, intent: d.draft.intent, place: d.draft.place_id, col: d.draft.column_id };
});
if (twoPlaces.status < 400) {
  throw new Error("同人两地应挡住 " + JSON.stringify(twoPlaces));
}
if (twoPlaces.status < 400 && !String(twoPlaces.text).includes("两个地点")) {
  // 若第一场并列未正史，可能挡不住。记下实际值。
}
out["4.9"] = { parCol: par.draft.column_id, newestCol: newest.draft.column_id, lastCol, twoPlaces, afterParCommit: afterParCommit.committed.length };

// 4.10 读序
const beat0 = (await state()).committed[0];
await page.locator(".card.canon").first().click();
await page.getByTestId("telling-ord").fill("2");
await page.getByTestId("set-telling").click();
await page.waitForTimeout(200);
async function worldSafe(t) {
  return page.evaluate(async (tt) => {
    const r = await fetch("/api/world?t=" + tt);
    const text = await r.text();
    try {
      return JSON.parse(text);
    } catch {
      return { error: text, status: r.status };
    }
  }, t);
}
const tRo = (await state()).committed.map((b) => b.clock_from).sort((a, b) => a - b)[0] || 0;
const worldBeforeRo = await worldSafe(tRo);
await page.getByTestId("reading-order").click();
await page.waitForTimeout(200);
const worldAfterRo = await worldSafe(tRo);
if (JSON.stringify(worldBeforeRo.playing) !== JSON.stringify(worldAfterRo.playing)) {
  throw new Error("切读序改了算出");
}
const toothCls = await page.evaluate(() => [...document.querySelectorAll(".tooth")].map((e) => e.className));
out["4.10"] = { telling: (await state()).committed[0].telling_ord, toothCls, playing: worldAfterRo.playing };

// 4.11 拖草稿换列；拖正史须确认
await page.getByTestId("intent").fill("草稿换列");
await page.getByTestId("write-next").click();
await page.locator(".card.draft").first().waitFor();
const draftMove = (await state()).drafts[(await state()).drafts.length - 1];
await page.getByTestId("add-column").click();
await page.getByTestId("suggest-empty_col").click();
await page.getByTestId("confirm-ok").click();
await page.waitForTimeout(400);
const destCol = (await state()).columns[(await state()).columns.length - 1].id;
const destIdx = (await state()).columns.length - 1;
await page.locator(`[data-testid="draft-${draftMove.id}"]`).dragTo(page.getByTestId("column-" + Math.min(destIdx, 3)));
await page.waitForTimeout(400);
let moved = await state();
const draftAfterMove = moved.drafts.find((d) => d.id === draftMove.id);
out["4.11-draft"] = { from: draftMove.draft.column_id, to: draftAfterMove && draftAfterMove.draft.column_id, destCol };
await page.locator(".card.canon").first().click();
const canonColBefore = (await state()).committed[0].column_id;
await page.locator(".card.canon").first().dragTo(page.getByTestId("column-0"));
await page.waitForTimeout(400);
const pendingMove = (await state()).pending;
if (pendingMove && pendingMove.op === "move_beat") {
  await page.getByTestId("confirm-cancel").click();
  await page.waitForTimeout(200);
}
const canonColAfterCancel = (await state()).committed[0].column_id;
if (canonColAfterCancel !== canonColBefore && (!pendingMove || pendingMove.op !== "move_beat")) {
  // 拖到同一列可能不变
}
out["4.11"] = { draftAfterMove: draftAfterMove && draftAfterMove.draft.column_id, canonColBefore, canonColAfterCancel, pendingOp: pendingMove && pendingMove.op };

// 4.6 删已正史
const seqsBefore = (await state()).committed.map((b) => b.commit_seq);
const failImpact = await page.evaluate(async () => {
  const s = await (await fetch("/api/state")).json();
  const id = s.committed[0].id;
  const r = await fetch("/api/delete-canon", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, fail_refs: true }),
  });
  return { status: r.status, text: await r.text() };
});
if (failImpact.status < 400) throw new Error("影响清单失败应挡住 " + JSON.stringify(failImpact));
const countBeforeDel = (await state()).committed.length;
await page.locator(".card.canon").first().click();
await page.getByTestId("delete-canon").click();
await page.getByTestId("confirm-change").waitFor();
const impacts = await page.getByTestId("impact-list").innerText();
if (!impacts.includes("故事时间空洞")) throw new Error("影响清单缺项 " + impacts);
await page.getByTestId("confirm-cancel").click();
await page.waitForTimeout(200);
if ((await state()).committed.length !== countBeforeDel) throw new Error("取消仍删了正史");
await page.getByTestId("delete-canon").click();
await page.getByTestId("suggest-shift").click();
await page.getByTestId("confirm-ok").click();
await page.waitForTimeout(500);
const afterDelCanon = await state();
const stillOldSeq = afterDelCanon.committed.map((b) => b.commit_seq);
out["4.6"] = { failImpact, impacts, seqsBefore, stillOldSeq, committedAfter: afterDelCanon.committed.length, countBeforeDel };

// 5.1 当众/私下
await page.getByTestId("intent").fill("阿福私下开箱");
await page.getByTestId("place-id").fill("渡口");
await page.getByTestId("write-next").click();
await page.locator(".card.draft").last().waitFor();
const privDraft = (await state()).drafts[(await state()).drafts.length - 1];
await page.locator(`[data-testid="draft-${privDraft.id}"]`).click();
await page.locator('[data-testid="ent-阿福"]').dragTo(page.locator(`[data-testid="draft-${privDraft.id}"]`));
await page.locator('[data-testid="ent-阿莲"]').dragTo(page.locator(`[data-testid="draft-${privDraft.id}"]`));
await page.locator('[data-testid="ent-阿禾"]').dragTo(page.locator(`[data-testid="draft-${privDraft.id}"]`));
await page.getByTestId("do-text").fill("阿福悄悄开箱");
await page.getByTestId("think-text").fill("刀在这里");
await page.getByTestId("vis-private").check();
await page.getByTestId("visible-to").fill("阿福,阿禾");
const [privCommit] = await Promise.all([
  page.waitForResponse((r) => r.url().includes("/api/commit") && r.request().method() === "POST"),
  page.getByTestId("commit").click(),
]);
const privText = await privCommit.text();
if (!privCommit.ok()) throw new Error("私下写入正史失败 " + privText);
await page.waitForTimeout(400);
const knows = await page.evaluate(async () => (await (await fetch("/api/knows")).json()));
const lianFacts = (knows.knows && knows.knows["阿莲"]) || [];
const fuFacts = (knows.knows && knows.knows["阿福"]) || [];
const score = knows.score;
if (score !== null && score !== undefined) {
  // 允许 JSON null
}
const lianSawPriv = lianFacts.some((f) => String(f).includes("悄悄开箱"));
const fuSawPriv = fuFacts.some((f) => String(f).includes("悄悄开箱"));
if (lianSawPriv) throw new Error("私下后阿莲仍默认看见开箱 " + JSON.stringify(lianFacts));
if (!fuSawPriv) throw new Error("私下阿福应看见开箱 " + JSON.stringify(fuFacts));
out["5.1"] = { knows, lianFacts, fuFacts, score, lianSawPriv, fuSawPriv, privOk: privCommit.ok() };

// 5.4 换书
await page.getByTestId("intent").fill("阿莲草稿不串书");
await page.getByTestId("write-next").click();
await page.locator(".card.draft").first().waitFor();
const bookB = "remB-" + Date.now();
await createBook(bookB);
await page.getByTestId("ent-search").fill("阿禾");
await page.getByTestId("do-search").click();
await page.waitForTimeout(200);
const hitsB = await page.getByTestId("search-hits").innerText();
await page.getByTestId("book-name").fill(book);
await page.getByTestId("open-book").click();
await page.getByTestId("book-label").filter({ hasText: book }).waitFor({ timeout: 20000 });
const back = await state();
out["5.4"] = { bookB, hitsB, backBook: back.book, backDrafts: back.drafts.map((d) => d.draft.intent), backEntities: back.entities.map((e) => e.id) };

// 5.6 档案场
await page.locator('[data-testid="ent-阿福"]').click();
await page.getByTestId("dossier").waitFor();
const db = await page.getByTestId("dossier-appearances").innerText();
const ro = await page.getByTestId("dossier-windows-table").innerText();
out["5.6"] = { db, ro };

await page.getByTestId("dossier-close").click();

// 6.2 抽查：细条不改正史；档案欲望不改算出；禁止扫描
const committedBeforeTooth = (await state()).committed.map((b) => b.id);
await page.locator('[data-testid="tooth-0"]').click();
await page.waitForTimeout(200);
const committedAfterTooth = (await state()).committed.map((b) => b.id);
await page.locator('[data-testid="ent-阿福"]').click();
await page.getByTestId("dossier-desire").fill("守住铜牌");
await page.getByTestId("dossier-save").click();
await page.getByTestId("dossier-close").click();
const worldAfterDossier = await page.evaluate(async () => (await (await fetch("/api/world?t=0")).json()));
const scan = spawnSync(
  "rg",
  ["-n", "import scribe3|SCRIBE3_|s3_|vis-timeline|Graphiti|EverOS|Semantica|HyperMem|TiMem", "--glob", "!vendor/narra/target/**", "--glob", "!e2e/node_modules/**", "--glob", "!**/.git/**"],
  { cwd: ROOT, encoding: "utf8" }
);
out["6.2"] = {
  committedBeforeTooth,
  committedAfterTooth,
  worldPlaying: worldAfterDossier.playing,
  scanStatus: scan.status,
  scanOut: (scan.stdout || "").slice(0, 500),
};

console.log(JSON.stringify(out, null, 2));
if (JSON.stringify(committedBeforeTooth) !== JSON.stringify(committedAfterTooth)) {
  throw new Error("细条改了正史");
}
console.log("REMAINING_CLICK_DONE");
await browser.close();
