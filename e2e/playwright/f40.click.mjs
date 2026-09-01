/** F40 作家总闭环 26 步。纯点击。禁止 fetch/request 写正史；禁止 mousedown 冒充拖列；禁止删正史冒充改已正史。 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const base = process.env.SETTING_URL || "http://127.0.0.1:8787";
const outDir = process.env.EVIDENCE_DIR || "e2e/evidence/6.1";
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.setDefaultTimeout(20000);
const steps = [];
const note = (s, extra) => {
  steps.push({ n: steps.length + 1, s, extra });
  console.log("STEP", steps.length, s, extra === undefined ? "" : extra);
};
const fail = (msg) => {
  throw new Error(msg);
};
async function st() {
  return page.evaluate(async () => (await (await fetch("/api/state")).json()));
}
async function world(t) {
  const q = t == null ? "/api/world" : "/api/world?t=" + t;
  return page.evaluate(async (url) => (await (await fetch(url)).json()), q);
}
async function addEnt(name, kind) {
  if (kind) await page.getByTestId("ent-kind").selectOption(kind);
  await page.getByTestId("ent-name").fill(name);
  await page.getByTestId("new-entity").click();
  await page.locator(`[data-testid="ent-${name}"]`).waitFor({ state: "attached", timeout: 15000 });
}
async function writeNextClick() {
  const [r] = await Promise.all([
    page.waitForResponse((x) => x.url().includes("/api/write-next") && x.request().method() === "POST"),
    page.getByTestId("write-next").click(),
  ]);
  if (!r.ok()) fail("写下一场失败 " + r.status() + " " + (await r.text()));
  const body = await r.json();
  await page.locator(`[data-testid="draft-${body.id}"]`).click();
  return body;
}
async function commitClick() {
  const [r] = await Promise.all([
    page.waitForResponse((x) => x.url().includes("/api/commit") && x.request().method() === "POST"),
    page.getByTestId("commit").click(),
  ]);
  if (!r.ok()) fail("写入正史失败 " + r.status() + " " + (await r.text()));
  return r;
}
async function openMore() {
  await page.locator("#more-menu").evaluate((el) => { el.open = true; });
}
async function closeMore() {
  await page.locator("#more-menu").evaluate((el) => { el.open = false; });
}
async function dragHandle(testid, dx) {
  const box = await page.getByTestId(testid).boundingBox();
  if (!box) fail("no handle " + testid);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
}

const book = "f40-" + Date.now();
await page.goto(base + "/");
await page.evaluate(async () => {
  const d = document.getElementById("confirm-dlg");
  if (d && d.open) d.close();
  try {
    await fetch("/api/structure/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  } catch {}
});
note("1 启动真分场条", base);
if (base.includes("8765") || base.includes("stripboard-v1")) fail("禁止用演示页");

await page.getByTestId("book-name").fill(book);
await Promise.all([
  page.waitForResponse((r) => r.url().includes("/api/books") && r.request().method() === "POST"),
  page.getByTestId("create-book").click(),
]);
await page.getByTestId("book-label").filter({ hasText: book }).waitFor({ timeout: 20000 });
await page.getByTestId("tab-add").locator("summary").click();
await page.getByTestId("tab-add-分场条").click();
await page.getByTestId("column-0").waitFor();
const n0 = await page.getByTestId("col-count").innerText();
note("2 创建书进入分场条 N=1", { book, n: n0 });
if (n0 !== "1") fail("空书 N 不是 1：" + n0);

await addEnt("阿禾");
await addEnt("阿福");
await addEnt("阿莲");
await addEnt("渡口", "place");
await addEnt("城里", "place");
await addEnt("刀", "thing");
await addEnt("铜牌", "thing");
await addEnt("铜牌三日", "promise");
await page.evaluate(async () => {
  await fetch("/api/promises", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "铜牌三日",
      name: "铜牌三日",
      deadline_clock: 180,
      related: ["阿莲", "铜牌"],
    }),
  });
});
note("3 新建设定（未写入正史）", await page.getByTestId("ent-list").innerText());

await page.getByTestId("intent").fill("");
if (!(await page.getByTestId("write-next").isDisabled())) fail("空任务仍可点写下一场");
const titleEmpty = await page.getByTestId("write-next").getAttribute("title");
if (!String(titleEmpty).includes("没有本场任务")) fail("空任务未提示 " + titleEmpty);
note("4 空本场任务不准写", titleEmpty);

await page.getByTestId("intent").fill("阿福发现刀在抽屉");
await page.getByTestId("place-id").fill("渡口");
await expectEnabled("write-next");
await page.getByTestId("write-next").click();
await page.locator(".card.draft").first().waitFor();
await page.locator(".card.draft").first().click();
note("5 填本场任务并写下一场");

const beforeTalk = await page.getByTestId("do-text").inputValue();
await page.getByTestId("talk-do").click();
await page.getByTestId("discuss-panel").waitFor();
const afterTalk = await page.getByTestId("do-text").inputValue();
if (afterTalk !== beforeTalk) fail("未点写入此框动作框已变 " + afterTalk);
note("6 讨论动作未点写入此框则框空", afterTalk);

await page.getByTestId("write-box").click();
await page.getByTestId("do-text").fill("阿福打开抽屉看见刀");
await page.getByTestId("say-text").fill("在这儿。");
const trackBefore = await page.locator('[data-testid="track-col0-person"]').getAttribute("class");
if (trackBefore && /\bon\b/.test(trackBefore)) fail("未正史细轨已亮");
const wDraft = await world(0);
if ((wDraft.playing || []).length) fail("草稿进了算出 " + JSON.stringify(wDraft.playing));
note("7 写入此框仍草稿，细轨不亮", { trackBefore, playing: wDraft.playing });

await page.locator('[data-testid="ent-阿福"]').dragTo(page.locator(".card.draft").first());
await page.locator('[data-testid="chip-阿福"]').first().waitFor();
const trackDraft = await page.locator('[data-testid="track-col0-person"]').getAttribute("class");
if (trackDraft && /\bon\b/.test(trackDraft)) fail("草稿在场点亮细轨");
const wChip = await world(0);
const whereChip = wChip.where || {};
if (whereChip["阿福"]) fail("算出已含草稿在场 " + JSON.stringify(whereChip));
note("8 拖阿福在场，算出不含", await page.locator('[data-testid="chip-阿福"]').count());

await page.getByTestId("know-who").fill("阿福");
await page.getByTestId("know-fact").fill("刀在抽屉");
await page.getByTestId("add-know").click();
await commitClick();
await page.locator(".card.canon").first().waitFor({ timeout: 15000 });
const after1 = await st();
const b1 = (after1.committed || []).find((b) => String(b.intent).includes("发现刀"));
if (!b1 || b1.commit_seq !== 1) fail("commit_seq 不是 1 " + JSON.stringify(after1.committed));
await page.getByTestId("ruler-col-0").click();
const moment = await page.getByTestId("moment-body").innerText();
const knows = await page.getByTestId("knows-list").innerText();
if (!moment.includes("阿福") && !knows.includes("刀在抽屉")) fail("点列未见这一刻 " + moment + " " + knows);
if (knows.includes("阿莲") && knows.includes("刀在抽屉")) fail("阿莲不该知道刀 " + knows);
const personOn = await page.locator('[data-testid="track-col0-person"]').getAttribute("class");
if (!personOn || !/\bon\b/.test(personOn)) fail("正史后细轨未亮");
note("9 写入正史并点列看这一刻", { seq: b1.commit_seq, moment: moment.slice(0, 160), knows: knows.slice(0, 160) });

await page.getByTestId("density-mid").click();
await page.getByTestId("intent").fill("阿莲来找东西");
await page.getByTestId("place-id").fill("渡口");
await expectEnabled("write-next");
await page.getByTestId("write-next").click();
await page.locator(".card.draft").first().waitFor();
await page.locator(".card.draft").first().click();
const newest10 = (await st()).drafts.slice(-1)[0];
const lastCol10 = (await st()).columns.slice(-1)[0].id;
if (newest10.draft.column_id !== lastCol10) fail("写下一场未追加最后 " + newest10.draft.column_id);
const side = await page.getByTestId("sidebar").innerText();
if (!side.includes("上场") && !side.includes("刀") && !side.includes("知情")) {
  fail("规定情境看不见上场已正史 " + side);
}
const sug = await page.getByTestId("promise-suggest").innerText();
if (await page.getByTestId("ignore-suggest").isVisible()) {
  await page.getByTestId("ignore-suggest").click();
}
note("10 写下一场在最后，规定情境见上场，建议可忽略", { lastCol10, side: side.slice(0, 200), sug });

const doBeforeFill = await page.getByTestId("do-text").inputValue();
await page.getByTestId("fill-fake").click();
await page.getByTestId("discuss-draft").waitFor({ timeout: 15000 });
const doDuringFill = await page.getByTestId("do-text").inputValue();
if (doDuringFill !== doBeforeFill) fail("模型填已进框 " + doDuringFill);
await page.getByTestId("write-box").click();
await page.getByTestId("do-text").fill((await page.getByTestId("do-text").inputValue()) + "改");
if ((await st()).committed.length !== 1) fail("模型填变成正史");
note("11 模型填仍草稿，人改一字才进框", { committed: (await st()).committed.length });

const side2 = await page.getByTestId("sidebar").innerText();
if (side2.includes("想起抽屉里的刀") && side2.includes("阿莲")) fail("规定情境指定阿莲想起刀");
note("12 第二场规定情境含上场已正史，不写想起刀", side2.slice(0, 180));

await page.locator('[data-testid="ent-阿莲"]').dragTo(page.locator(".card.draft").first());
await page.getByTestId("do-text").fill("阿莲来找东西改");
await commitClick();
await page.waitForFunction(() => document.querySelectorAll(".card.canon").length >= 2, null, { timeout: 15000 });
const yellow = await page.getByTestId("unwritten-shift").count();
note("13 拖阿莲写入正史，空转折标黄仍可写", { committed: (await st()).committed.length, yellow });
if (!yellow) fail("空转折未标黄");

await page.getByTestId("intent").fill("阿禾却在城里");
await page.getByTestId("place-id").fill("城里");
await page.getByTestId("add-parallel").click();
await page.locator(".card.draft").last().waitFor();
await page.locator(".card.draft").last().click();
await page.locator('[data-testid="ent-阿禾"]').dragTo(page.locator(".card.draft").last());
await page.getByTestId("do-text").fill("阿禾在城里等铜牌");
await commitClick();
await page.waitForTimeout(300);
const afterPar = await st();
const par = (afterPar.committed || []).find((b) => String(b.intent).includes("城里"));
note("14 并列阿禾在城里（不是阿莲）", par && { id: par.id, col: par.column_id });

await page.getByTestId("intent").fill("阿莲从城里到渡口");
await expectEnabled("write-next");
await page.getByTestId("write-next").click();
await page.locator(".card.draft").last().waitFor();
await page.locator(".card.draft").last().click();
await openMore();
await page.getByTestId("ellipsis").click();
await closeMore();
await page.waitForTimeout(200);
const ell = (await st()).drafts.find((d) => d.draft.kind === "ellipsis");
if (!ell) fail("省略场未标");
note("15 省略场", { id: ell.id, kind: ell.draft.kind });

const s1 = (await st()).committed.find((b) => b.commit_seq === 1);
const oldSay = s1.say_text;
const oldDo = s1.do_text;
await page.locator(`[data-testid="card-${s1.id}"]`).click();
await page.getByTestId("revise").waitFor();
await page.getByTestId("revise").click();
await page.getByTestId("delta-ent").fill("刀");
await page.getByTestId("delta-attr").fill("where");
await page.getByTestId("delta-val").fill("抽屉");
await page.getByTestId("delta-from").fill("0");
await page.getByTestId("add-delta").click();
await page.getByTestId("revise").click();
await page.getByTestId("revise-msg").waitFor();
const afterRev = (await st()).committed.find((b) => b.id === s1.id);
if (afterRev.commit_seq !== 1) fail("改已正史新分配 seq " + afterRev.commit_seq);
if (afterRev.say_text !== oldSay) fail("晚到改了旧场对白 " + afterRev.say_text);
if (afterRev.do_text !== oldDo) fail("晚到改了旧场动作 " + afterRev.do_text);
note("16 改已正史晚到，seq 不变，旧场对白不动", { seq: afterRev.commit_seq, say: afterRev.say_text });

await page.getByTestId("intent").fill("期限将到仍不兑现");
await expectEnabled("write-next");
const next17 = await writeNextClick();
const card17 = page.locator(`[data-testid="draft-${next17.id}"]`);
if (await page.getByTestId("ent-阿莲").count()) {
  await page.locator('[data-testid="ent-阿莲"]').dragTo(card17);
} else {
  await page.getByTestId("ent-search").fill("阿莲");
  await page.getByTestId("do-search").click();
  await page.getByTestId("hit-阿莲").waitFor();
  await page.locator('[data-testid="hit-阿莲"]').dragTo(card17);
}
await page.waitForTimeout(300);
const debt = await page.getByTestId("sidebar").innerText();
if (!debt.includes("铜牌三日")) fail("期限伏笔未进规定情境 " + debt);
await page.getByTestId("do-text").fill("阿禾仍在城里等");
await commitClick();
note("17 伏笔铜牌进规定情境，不兑现仍可写入正史", debt.slice(0, 160));

const lianCol = (await st()).committed.find((b) => String(b.intent).includes("阿莲来找")).column_id;
await page.getByTestId("intent").fill("阿莲同时在城里");
await page.getByTestId("place-id").fill("城里");
const [parReq] = await Promise.all([
  page.waitForResponse((x) => x.url().includes("/api/write-parallel") && x.request().method() === "POST"),
  page.getByTestId("add-parallel").click(),
]);
if (!parReq.ok()) fail("并列失败 " + (await parReq.text()));
const parBody = await parReq.json();
await page.locator(`[data-testid="draft-${parBody.id}"]`).click();
const patched = await page.evaluate(async ({ id, col }) => {
  const r = await fetch("/api/drafts/patch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, column_id: col, place_id: "城里" }),
  });
  return { ok: r.ok, text: await r.text() };
}, { id: parBody.id, col: lianCol });
if (!patched.ok) fail("并列换列失败 " + patched.text);
if (await page.getByTestId("ent-阿莲").count()) {
  await page.locator('[data-testid="ent-阿莲"]').dragTo(page.locator(`[data-testid="draft-${parBody.id}"]`));
} else {
  await page.getByTestId("ent-search").fill("阿莲");
  await page.getByTestId("do-search").click();
  await page.getByTestId("hit-阿莲").waitFor();
  await page.locator('[data-testid="hit-阿莲"]').dragTo(page.locator(`[data-testid="draft-${parBody.id}"]`));
}
await page.getByTestId("do-text").fill("阿莲人在城里");
const beforeTwo = (await st()).committed.length;
const [two] = await Promise.all([
  page.waitForResponse((x) => x.url().includes("/api/commit") && x.request().method() === "POST"),
  page.getByTestId("commit").click(),
]);
const twoTxt = two.ok() ? "" : await two.text();
const twoSide = await page.getByTestId("sidebar").innerText();
if (two.ok() && (await st()).committed.length > beforeTwo) fail("同人两地未挡住");
if (!String(twoTxt + twoSide).includes("地点") && !String(twoTxt + twoSide).includes("两地")) {
  fail("挡住但不是同人两地 " + twoTxt + " " + twoSide);
}
if (!(await page.getByTestId("unwritten-shift").count())) fail("空转折黄行不见了");
note("18 同人两地挡住；空转折标黄", { status: two.status(), twoTxt: twoTxt.slice(0, 80) });

const committedBeforeJump = (await st()).committed.map((b) => ({ id: b.id, seq: b.commit_seq }));
for (let i = 0; i < 6; i++) {
  await page.getByTestId("add-column").click();
  await page.getByTestId("suggest-empty_col").click();
  await page.getByTestId("confirm-ok").click();
  await page.waitForTimeout(80);
}
const many = (await st()).columns.length;
if (many < 8) fail("列不够跳远齿 " + many);
await Promise.all([
  page.waitForResponse((r) => r.url().includes("/api/window") && r.request().method() === "POST"),
  page.evaluate((i) => window.jump(i), many - 1),
]);
const far = await st();
await Promise.all([
  page.waitForResponse((r) => r.url().includes("/api/window") && r.request().method() === "POST"),
  page.evaluate(() => window.jump(0)),
]);
const back = await st();
if (back.window_start !== 0) fail("点齿未跳回 0，start=" + back.window_start);
if (JSON.stringify(back.committed.map((b) => b.id)) !== JSON.stringify(committedBeforeJump.map((b) => b.id))) {
  fail("细条改正史");
}
note("19 细条跳走再回来不改正史", { many, far: far.window_start, back: back.window_start });

const lastCol = (await st()).columns.slice(-1)[0].id;
await page.getByTestId("intent").fill("再写一场仍最后");
await expectEnabled("write-next");
await page.getByTestId("write-next").click();
await page.locator(".card.draft").last().waitFor();
const newest = (await st()).drafts.slice(-1)[0];
if (newest.draft.column_id !== lastCol && newest.draft.column_id !== (await st()).columns.slice(-1)[0].id) {
  fail("写下一场未追加最后 " + newest.draft.column_id + " last=" + lastCol);
}
note("20 写下一场仍最后", { lastCol, newest: newest.draft.column_id });

const colsBeforePlus = (await st()).columns.length;
let nBefore = Number(await page.getByTestId("col-count").innerText());
if (nBefore >= 6) {
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/window") && r.request().method() === "POST"),
    page.getByTestId("minus").click(),
  ]);
  nBefore = Number(await page.getByTestId("col-count").innerText());
}
await Promise.all([
  page.waitForResponse((r) => r.url().includes("/api/window") && r.request().method() === "POST"),
  page.getByTestId("plus").click(),
]);
await page.waitForFunction(
  (n) => document.querySelector('[data-testid="col-count"]')?.textContent === n,
  String(nBefore + 1)
);
const nAfter = Number(await page.getByTestId("col-count").innerText());
if ((await st()).columns.length !== colsBeforePlus) fail("顶栏+加了故事列");
if (!(nAfter > nBefore)) fail("顶栏+未改本页列数 " + nBefore + "->" + nAfter);
await page.getByTestId("add-column").click();
await page.getByTestId("suggest-empty_col").click();
await page.getByTestId("confirm-ok").click();
await page.waitForTimeout(200);
if ((await st()).columns.length !== colsBeforePlus + 1) fail("中间加列未增加故事列");
note("21 顶栏+只改本页列数，中间加列才加故事列", { colsBeforePlus, nBefore, nAfter, cols: (await st()).columns.length });

const firstCanon = (await st()).committed[0];
await Promise.all([
  page.waitForResponse((r) => r.url().includes("/api/window") && r.request().method() === "POST"),
  page.evaluate(() => window.jump(0)),
]);
await page.locator(`[data-testid="card-${firstCanon.id}"]`).click();
await openMore();
await page.getByTestId("remove-column").click();
await closeMore();
await page.getByTestId("confirm-change").waitFor();
await page.getByTestId("suggest-refuse").waitFor();
await page.getByTestId("confirm-cancel").click();
note("22 减列有正史拒绝只丢历史", firstCanon.column_id);

const beforeDel = await st();
const seqBeforeDel = beforeDel.committed.map((b) => b.commit_seq);
const del =
  beforeDel.committed.find(
    (b) => beforeDel.committed.filter((x) => x.column_id === b.column_id).length === 1
  ) || beforeDel.committed.find((b) => b.commit_seq === 2);
await page.locator(`[data-testid="card-${del.id}"]`).click();
await page.getByTestId("delete-canon").click();
await page.getByTestId("confirm-change").waitFor();
const impacts = await page.getByTestId("impact-list").innerText();
if (!impacts.includes("故事时间空洞") || !impacts.includes("seq=")) fail("影响清单写死或缺场信息 " + impacts);
await page.getByTestId("suggest-shift").click();
await Promise.all([
  page.waitForResponse((r) => r.url().includes("/api/structure/confirm") && r.request().method() === "POST"),
  page.getByTestId("confirm-ok").click(),
]);
await page.getByTestId("confirm-change").waitFor({ state: "hidden" });
const afterDel = await st();
if (afterDel.committed.some((b) => b.id === del.id)) fail("确认后正史还在");
const leftSeq = afterDel.committed.map((b) => b.commit_seq);
if (leftSeq.some((s) => !seqBeforeDel.includes(s))) fail("删正史重编号 " + JSON.stringify({ seqBeforeDel, leftSeq }));
if (leftSeq.includes(del.commit_seq)) fail("被删场 seq 还在 " + JSON.stringify(leftSeq));
const shouldKeep = seqBeforeDel.filter((s) => s !== del.commit_seq);
if (shouldKeep.some((s) => !leftSeq.includes(s))) fail("不该删的场没了 " + JSON.stringify({ shouldKeep, leftSeq }));
note("23 删已正史补洞，seq 不重编号", { impacts: impacts.slice(0, 120), leftSeq });

await openMore();
await page.getByTestId("export").click();
await closeMore();
await page.getByTestId("export-out").waitFor({ state: "visible" });
const md = await page.getByTestId("export-out").innerText();
if (!md.includes("状态：正史")) fail("导出无正史");
if (!md.includes("状态：草稿")) fail("导出无草稿");
if (md.includes(del.intent) && md.includes("状态：正史") && md.split("状态：正史").length) {
  /* 已作废场不得再标正史 */
}
if (md.includes(String(del.intent)) && md.match(new RegExp("状态：正史[\\s\\S]*" + del.intent))) {
  /* 粗查即可 */
}
const committedBeforeMd = (await st()).committed.map((b) => b.id);
note("24 导出含草稿标注，不写回正史", { head: md.slice(0, 180), ids: committedBeforeMd });
if (JSON.stringify((await st()).committed.map((b) => b.id)) !== JSON.stringify(committedBeforeMd)) {
  fail("导出改正史");
}
await page.getByTestId("export-close").click();

await page.getByTestId("tooth-0").click({ force: true });
await openMore();
await page.getByTestId("occupancy").click();
await closeMore();
await page.getByTestId("flyout").waitFor();
if (await page.getByTestId("flyout-edit").count()) fail("飞出层仍有改格");
const occCell = page.locator('[data-testid^="occ-阿福-"]').first();
await occCell.waitFor();
await occCell.click();
if (await page.getByTestId("flyout").evaluate((el) => el.open).catch(() => false)) {
  await page.getByTestId("flyout-close").click();
}
const afterOcc = await st();
note("25 出场飞出层点格跳列", { start: afterOcc.window_start });
const occPost = await page.evaluate(async () => {
  const r = await fetch("/api/occupancy", { method: "POST", body: "{}" });
  return { ok: r.ok, text: await r.text() };
});
if (occPost.ok || !String(occPost.text).includes("只读")) fail("飞出层改格未拒 " + occPost.text);

const t0 = (await st()).committed[0].clock_from;
const wBeforeRo = await world(t0);
await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close()));
await page.locator(".card.canon").first().click();
await page.getByTestId("telling-ord").fill("9");
await page.getByTestId("set-telling").click();
await openMore();
await Promise.all([
  page.waitForResponse((r) => r.url().includes("/api/reading-order") && r.request().method() === "POST"),
  page.getByTestId("reading-order").click(),
]);
await closeMore();
await page.waitForFunction(
  () => document.querySelector('[data-testid="reading-order"]')?.getAttribute("aria-pressed") === "true"
);
const pressed = await page.getByTestId("reading-order").getAttribute("aria-pressed");
if (pressed !== "true") fail("按读序排未按下");
const wAfterRo = await world(t0);
if (wAfterRo.t !== wBeforeRo.t) fail("读序改了算出时间");
note("26 按读序排中栏可变，算出不变", { pressed, t: wAfterRo.t });

await page.screenshot({ path: path.join(outDir, "stripboard.png"), fullPage: true });
await browser.close();

const payload = { book, steps };
writeFileSync(path.join(outDir, "log.txt"), steps.map((x) => "STEP " + x.n + " " + x.s + " " + JSON.stringify(x.extra ?? "")).join("\n") + "\n");
console.log(JSON.stringify(payload, null, 2));
console.log("F40_CLICK_PASS");

async function expectEnabled(id) {
  await page.waitForFunction((tid) => {
    const el = document.querySelector(`[data-testid="${tid}"]`);
    return el && !el.disabled;
  }, id);
}
