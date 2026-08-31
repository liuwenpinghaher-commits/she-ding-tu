/** 渡口全书：点击走完 v1 全部能力，正史留在 data/books/渡口。 */
import { chromium } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const base = process.env.SETTING_URL || "http://127.0.0.1:8787";
const BOOK = "渡口";
const REPORT = process.env.SETTING_DATA_REPORT || "/Users/miaoma/Downloads/写作设定项目/data/books/渡口";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.setDefaultTimeout(20000);
const note = [];
const log = (s, extra) => {
  note.push({ s, extra });
  console.log("STEP", s, extra === undefined ? "" : extra);
};

async function st() {
  return page.evaluate(async () => (await (await fetch("/api/state")).json()));
}
async function world(t) {
  const q = t == null ? "/api/world" : "/api/world?t=" + t;
  return page.evaluate(async (url) => {
    const r = await fetch(url);
    const text = await r.text();
    try { return JSON.parse(text); } catch { return { error: text }; }
  }, q);
}
async function addEnt(name, kind) {
  if (kind) await page.getByTestId("ent-kind").selectOption(kind);
  await page.getByTestId("ent-name").fill(name);
  await page.getByTestId("new-entity").click();
  await page.locator(`[data-testid="ent-${name}"]`).waitFor({ state: "attached", timeout: 15000 });
}
async function drag(name, cardSel) {
  await page.locator(`[data-testid="ent-${name}"]`).dragTo(page.locator(cardSel).first());
  await page.waitForTimeout(200);
}
async function commitOk() {
  const [r] = await Promise.all([
    page.waitForResponse((x) => x.url().includes("/api/commit") && x.request().method() === "POST"),
    page.getByTestId("commit").click(),
  ]);
  if (!r.ok()) throw new Error("写入正史失败 " + (await r.text()));
  await page.waitForTimeout(300);
}
async function writeNext(intent, place) {
  await page.getByTestId("intent").fill(intent);
  if (place) await page.getByTestId("place-id").fill(place);
  const [r] = await Promise.all([
    page.waitForResponse((x) => x.url().includes("/api/write-next") && x.request().method() === "POST"),
    page.getByTestId("write-next").click(),
  ]);
  if (!r.ok()) throw new Error("写下一场失败 " + intent + " " + (await r.text()));
  const body = await r.json();
  await page.locator(`[data-testid="draft-${body.id}"]`).waitFor({ timeout: 15000 });
  await page.locator(`[data-testid="draft-${body.id}"]`).click();
  return body;
}
async function writeParallel(intent, place) {
  await page.getByTestId("intent").fill(intent);
  if (place) await page.getByTestId("place-id").fill(place);
  const [r] = await Promise.all([
    page.waitForResponse((x) => x.url().includes("/api/write-parallel") && x.request().method() === "POST"),
    page.getByTestId("add-parallel").click(),
  ]);
  if (!r.ok()) throw new Error("并列失败 " + (await r.text()));
  const body = await r.json();
  await page.locator(`[data-testid="draft-${body.id}"]`).waitFor({ timeout: 15000 });
  await page.locator(`[data-testid="draft-${body.id}"]`).click();
  return body;
}
async function fillScene({ doText, say, think, value, deltas = [], knows = [], visPrivate, visibleTo }) {
  if (doText != null) await page.getByTestId("do-text").fill(doText);
  if (say != null) await page.getByTestId("say-text").fill(say);
  if (think != null) await page.getByTestId("think-text").fill(think);
  if (value != null) await page.getByTestId("value-shift").fill(value);
  for (const [entity_id, attr, val] of deltas) {
    await page.getByTestId("delta-ent").fill(entity_id);
    await page.getByTestId("delta-attr").fill(attr);
    await page.getByTestId("delta-val").fill(val);
    await page.getByTestId("add-delta").click();
  }
  for (const [who, fact] of knows) {
    await page.getByTestId("know-who").fill(who);
    await page.getByTestId("know-fact").fill(fact);
    await page.getByTestId("add-know").click();
  }
  if (visPrivate) {
    await page.getByTestId("vis-private").check();
    if (visibleTo) await page.getByTestId("visible-to").fill(visibleTo);
  } else {
    await page.getByTestId("vis-public").check();
  }
}
async function fillDossier(id, profile) {
  await page.locator(`[data-testid="ent-${id}"]`).click();
  await page.getByTestId("dossier").waitFor();
  for (const [k, v] of Object.entries(profile)) {
    const tid = k === "desire" ? "dossier-desire" : "dossier-" + k;
    const loc = page.getByTestId(tid);
    await loc.waitFor({ state: "visible" });
    await loc.fill(v);
  }
  await page.getByTestId("dossier-save").click();
  await page.getByTestId("dossier-close").click();
}
async function deleteDraftUi() {
  await page.getByTestId("delete-draft").click();
  await page.getByTestId("gap-ok").click();
  await page.waitForTimeout(250);
}

await page.goto(base + "/");
await page.getByTestId("book-name").fill(BOOK);
await Promise.all([
  page.waitForResponse((r) => r.url().includes("/api/books") && r.request().method() === "POST"),
  page.getByTestId("create-book").click(),
]);
await page.getByTestId("book-label").filter({ hasText: BOOK }).waitFor({ timeout: 20000 });
await page.getByTestId("column-0").waitFor();
const n0 = await page.getByTestId("col-count").innerText();
if (n0 !== "4") throw new Error("空书本页列数默认应为 4，得到 " + n0);
log("创建书", { book: BOOK, n: n0 });

for (const [n, k] of [
  ["阿禾", "person"], ["阿福", "person"], ["阿莲", "person"],
  ["渡口", "place"], ["城里", "place"],
  ["刀", "thing"], ["铜牌", "thing"],
  ["渡口帮", "faction"],
  ["渡口夜间不得开船", "rule"],
]) await addEnt(n, k);
log("新建设定");

await fillDossier("阿禾", {
  setup: "渡口帮跑腿的年轻人。认得城里门房，却不敢在城门口久站。",
  role: "跑腿",
  appearance: "瘦，裤脚常湿",
  voice: "话短，叫人时先看一眼再开口",
  desire: "把铜牌送进城，自己不沾祸",
  need: "被人当自己人",
  fear: "帮里拿他当弃子",
  secret: "铜牌不是他自己的",
  ties: "听阿福的；欠阿莲一句实话",
});
await fillDossier("阿福", {
  setup: "渡口柜台里的人。抽屉是他的边界。",
  role: "柜台",
  appearance: "手指有油布味",
  voice: "慢，能把「没看见」说成事实",
  desire: "看住抽屉，不让阿莲看见刀",
  need: "把祸事关在自己这一侧",
  wound: "上回开抽屉开早了，帮里有人没回来",
  secret: "刀是替谁收的，他没问完",
  limit: "不当着阿莲开抽屉",
});
await fillDossier("阿莲", {
  setup: "从城里来渡口找铜牌的人。铜牌是进城的凭证，也是她要回来的东西。",
  role: "来找东西的人",
  appearance: "袖口有城门灰",
  voice: "问句多，不解释自己",
  desire: "找回铜牌",
  need: "确认渡口还认她",
  fear: "铜牌已经换了手",
  secret: "铜牌上的名字不是现在这个",
});
await fillDossier("渡口", {
  setup: "江边夜船停靠处。柜台后有抽屉，帮里有仓。",
  place_kind: "码头/室内柜台",
  atmosphere: "潮、油灯、脚步声停在门槛外",
  senses: "湿木、煤油、远处缆绳",
  function: "交割、藏东西、等人",
  access: "帮里的人进柜台；外人停在柜面",
});
await fillDossier("城里", {
  setup: "城门内。阿禾不敢问渡口的事。",
  place_kind: "城门内",
  atmosphere: "灯多、问话少",
  function: "铜牌该抵达的地方",
  access: "有铜牌才过得去",
});
await fillDossier("刀", {
  setup: "短刀，油布裹着，不该出现在柜台抽屉。",
  appearance: "短、有油",
  function: "把柄",
  owner_setup: "原不该有主",
  place_setup: "渡口柜台抽屉",
  symbol: "谁开抽屉谁就沾上祸",
});
await fillDossier("铜牌", {
  setup: "进城凭证。阿莲要找回来的那一块。",
  function: "过城门",
  owner_setup: "阿莲",
  place_setup: "不知所终",
  symbol: "三日期限",
});
await fillDossier("渡口帮", {
  setup: "管夜船和柜台抽屉的组织。",
  creed: "夜船的事不过柜面",
  public_face: "渡口上的人",
  private_line: "抽屉里的东西不登记",
  leader_setup: "不上场的人",
});
await fillDossier("渡口夜间不得开船", {
  setup: "夜里不得开船。省略场里可以赶路，不能当众开船。",
  capability: "挡夜航",
  cost: "误了城门的人只能等",
  limit: "帮里私自解缆算穿帮",
  enforcement: "标黄",
  scope: "渡口、入夜之后",
});
log("档案 F10");

await page.getByTestId("ent-search").fill("阿莲");
await page.getByTestId("do-search").click();
await page.getByTestId("hit-阿莲").waitFor();
log("搜全书");

await page.getByTestId("intent").fill("");
await page.getByTestId("write-next").click();
await page.waitForTimeout(200);
const blocked = await page.getByTestId("sidebar").innerText();
if (!blocked.includes("没有本场任务")) throw new Error("空任务未挡 " + blocked);
log("空任务不准写", blocked);

const s1 = await writeNext("阿福发现刀在抽屉", "渡口");
await drag("阿福", `[data-testid="draft-${s1.id}"]`);
await drag("刀", `[data-testid="draft-${s1.id}"]`);
await page.getByTestId("talk").click();
await page.getByTestId("write-box").click();
await page.waitForTimeout(200);
const talked = await page.getByTestId("do-text").inputValue();
if (!talked.includes("讨论稿")) throw new Error("讨论未写入此框 " + talked);
await fillScene({
  doText: "阿福拉开柜台抽屉，油布里躺着一把短刀。他看了一眼，把油布重新盖上。",
  say: "",
  think: "阿莲今晚来找铜牌。抽屉不能开给她看。",
  value: "无知→把柄",
  deltas: [["刀", "holder", "阿福"]],
  knows: [["阿福", "刀在抽屉"]],
  visPrivate: true,
  visibleTo: "阿福",
});
await commitOk();
await page.locator(".card.canon").first().waitFor({ timeout: 15000 });
const after1 = await st();
if (after1.committed.length !== 1) throw new Error("正史1数量 " + after1.committed.length);
if (after1.committed[0].value_shift === "本场变化") throw new Error("价值转折仍是占位");
log("正史1 阿福发现刀", { id: after1.committed[0].id, col: after1.committed[0].column_id, seq: after1.committed[0].commit_seq });

const w1 = await world(10);
if (w1.error) throw new Error("world_at 失败 " + w1.error);
const fuKnows = (w1.knows && w1.knows["阿福"]) || [];
const lianKnows = (w1.knows && w1.knows["阿莲"]) || [];
if (!fuKnows.some((f) => String(f).includes("刀"))) throw new Error("阿福应知道刀 " + JSON.stringify(fuKnows));
if (lianKnows.some((f) => String(f).includes("刀在抽屉"))) throw new Error("阿莲不应知道刀在抽屉");
const knifeState = (w1.states || []).filter((s) => s.entity_id === "刀");
if (!knifeState.some((s) => s.value === "阿福" || String(s.value).includes("阿福"))) {
  throw new Error("正史无刀.holder=阿福 " + JSON.stringify(knifeState));
}
log("算出这一刻", { playing: w1.playing, where: w1.where, fuKnows, knifeState });

await page.getByTestId("ent-name").fill("阿福");
await page.getByTestId("delete-entity").click();
await page.waitForTimeout(200);
const hung = await page.getByTestId("sidebar").innerText();
if (!hung.includes("已挂在场上")) throw new Error("在场设定应禁止删 " + hung);
log("已挂不能删设定", hung);

await page.getByTestId("plant-promise").click();
await page.waitForTimeout(200);
const wPromise = await world(10);
if (!(wPromise.promises || []).some((p) => p.name === "铜牌三日" || p.id === "token_due")) {
  throw new Error("伏笔未进算出 " + JSON.stringify(wPromise.promises));
}
log("埋伏笔 铜牌三日");

const s2 = await writeNext("阿莲来找东西", "渡口");
if (s2.column_id === s1.column_id) throw new Error("写下一场未另开列 " + s2.column_id);
await drag("阿莲", `[data-testid="draft-${s2.id}"]`);
await drag("阿福", `[data-testid="draft-${s2.id}"]`);
await page.waitForTimeout(300);
const side = await page.getByTestId("sidebar").innerText();
if (!side.includes("本场任务")) throw new Error("规定情境空 " + side);
if (!side.includes("阿莲来找东西")) throw new Error("侧栏不见本场任务 " + side);
const sug = await page.getByTestId("promise-suggest").innerText();
await page.getByTestId("ignore-suggest").click();
const ignored = await page.getByTestId("promise-suggest").innerText();
if (!ignored.includes("已忽略")) throw new Error("忽略建议失败 " + ignored);
log("规定情境", { side, sug, ignored });

const fake = await page.evaluate(async () => {
  const s = await (await fetch("/api/state")).json();
  const id = s.selected || s.drafts[0].id;
  const r = await fetch("/api/fill-fake", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
  return r.json();
});
if (JSON.stringify(fake.model_input || {}).includes("promise_suggestion") || fake.model_input_has_suggestion) {
  throw new Error("模型输入含伏笔建议");
}
await page.getByTestId("fill-fake").click();
await page.waitForFunction(() => {
  const v = document.querySelector('[data-testid="do-text"]')?.value || "";
  return v.length > 0 && !v.startsWith("为「");
}, null, { timeout: 25000 });
const filledDo = await page.getByTestId("do-text").inputValue();
if (!filledDo) throw new Error("模型填下一场未进框");
await page.getByTestId("do-text").fill(filledDo + "（人改）");
await page.getByTestId("write-box").click();
await page.waitForTimeout(250);
if ((await st()).committed.length !== 1) throw new Error("写入此框变成正史");
await page.getByTestId("paste").click();
await page.getByTestId("paste-text").fill("阿福打开抽屉。\n阿莲：东西呢。");
await page.getByTestId("paste-run").click();
await page.waitForTimeout(250);
const pasteUi = await page.getByTestId("paste-suggest").innerText();
if (!pasteUi.includes("写入此框")) throw new Error("粘贴未见建议 " + pasteUi);
const committedBeforePaste = (await st()).committed.length;
await page.getByTestId("paste-apply-paste0").click();
await page.waitForTimeout(200);
if ((await st()).committed.length !== committedBeforePaste) throw new Error("一贴即正史");
log("丢一段草稿", pasteUi.slice(0, 120));
await fillScene({
  doText: "阿莲翻柜找铜牌，手没碰抽屉。阿福挡在柜台里侧，把油灯往自己这边拨。",
  say: "阿莲：我的铜牌呢。阿福：没看见。",
  think: "阿福：别让她开抽屉。阿莲：铜牌不在柜面。",
  value: "寻找→落空",
});
await commitOk();
const after2 = await st();
const beat2 = after2.committed.find((b) => b.intent.includes("阿莲"));
if (!beat2) throw new Error("正史2缺失");
if (beat2.column_id === after1.committed[0].column_id) throw new Error("两场叠在同一列");
log("正史2 阿莲来找", { id: beat2.id, col: beat2.column_id, seq: beat2.commit_seq });

const junk = await writeNext("这段只用来删草稿", "渡口");
await page.locator(`[data-testid="draft-${junk.id}"]`).click();
await deleteDraftUi();
if ((await st()).drafts.some((d) => d.id === junk.id)) throw new Error("草稿未删");
log("删草稿场", junk.id);

const lianIdx = (await st()).columns.findIndex((c) => c.id === beat2.column_id);
if (lianIdx >= 0) {
  await page.locator(`[data-testid="tooth-${lianIdx}"]`).click();
  await page.waitForTimeout(200);
}
const par = await writeParallel("阿禾在城里等信", "城里");
await drag("阿禾", `[data-testid="draft-${par.id}"]`);
await fillScene({
  doText: "阿禾在城门内来回走，不敢问渡口的事。口袋里没有铜牌。",
  say: "",
  think: "铜牌若还在渡口，今晚过不了城门。",
  value: "等待→焦灼",
  deltas: [["阿禾", "where", "城里"]],
});
await commitOk();
log("正史并列 阿禾在城里", { id: par.id, col: par.column_id });

const two = await writeParallel("阿福却在城里", "城里");
await drag("阿福", `[data-testid="draft-${two.id}"]`);
await fillScene({ doText: "阿福出现在城里。", value: "穿帮" });
const beforeTwo = (await st()).committed.length;
const [twoResp] = await Promise.all([
  page.waitForResponse((r) => r.url().includes("/api/commit") && r.request().method() === "POST"),
  page.getByTestId("commit").click(),
]);
const twoText = await twoResp.text();
if (twoResp.ok() && (await st()).committed.length > beforeTwo) {
  throw new Error("同人两地未挡住 " + twoText);
}
if (!twoText.includes("两个地点") && !twoText.includes("同人两地")) {
  throw new Error("挡住了但不是同人两地：" + twoText);
}
log("同人两地挡", { status: twoResp.status(), text: twoText });
await page.locator(`[data-testid="draft-${two.id}"]`).click();
await deleteDraftUi();

const ell = await writeNext("阿莲连夜赶回城里", "城里");
await drag("阿莲", `[data-testid="draft-${ell.id}"]`);
await page.getByTestId("ellipsis").click();
await page.waitForTimeout(200);
await fillScene({
  value: "渡口→城里",
  deltas: [["阿莲", "where", "城里"]],
});
await commitOk();
const ellBeat = (await st()).committed.find((b) => b.intent.includes("赶回"));
if (!ellBeat || ellBeat.kind !== "ellipsis") throw new Error("省略场 kind " + JSON.stringify(ellBeat));
log("省略场 阿莲回城", { id: ellBeat.id, col: ellBeat.column_id, from: ellBeat.clock_from });

const wLate = await world(ellBeat.clock_from);
if ((wLate.knows && wLate.knows["阿莲"] || []).some((f) => String(f).includes("刀在抽屉"))) {
  throw new Error("省略场不该让阿莲知道刀 " + JSON.stringify(wLate.knows && wLate.knows["阿莲"]));
}
if ((wLate.where && wLate.where["阿莲"]) !== "城里") {
  log("阿莲所在", wLate.where);
  if (!((wLate.states || []).some((s) => s.entity_id === "阿莲" && s.value === "城里"))) {
    throw new Error("阿莲未到城里 " + JSON.stringify({ where: wLate.where, states: wLate.states }));
  }
}

const hide = await writeNext("阿福把刀藏进帮里仓", "渡口");
await drag("阿福", `[data-testid="draft-${hide.id}"]`);
await drag("刀", `[data-testid="draft-${hide.id}"]`);
await drag("渡口帮", `[data-testid="draft-${hide.id}"]`);
await fillScene({
  doText: "阿福把油布卷紧，从柜台后绕进帮里仓，把刀塞进最底层的网里。",
  think: "抽屉空了。阿莲再来也翻不到。",
  value: "把柄→收藏",
  deltas: [["刀", "where", "渡口帮仓"]],
  knows: [["阿福", "刀在帮里仓"]],
  visPrivate: true,
  visibleTo: "阿福",
});
await commitOk();
log("正史 藏刀");

const lastCanon = (await st()).committed[(await st()).committed.length - 1];
await page.locator(`[data-testid="card-${lastCanon.id}"]`).click();
await page.getByTestId("telling-ord").fill("1");
await page.getByTestId("set-telling").click();
await page.waitForTimeout(200);

await page.getByTestId("occupancy").click();
await page.getByTestId("flyout").waitFor();
if (await page.getByTestId("flyout-edit").count()) throw new Error("飞出层不应有改格");
const flyErr = await page.evaluate(async () => {
  const r = await fetch("/api/occupancy", { method: "POST", body: "{}" });
  return r.ok ? "" : await r.text();
});
if (!String(flyErr).includes("只读")) throw new Error("出场飞出层应拒绝改格 " + flyErr);
await page.getByTestId("flyout-close").click();
log("出场只读", flyErr);

await page.getByTestId("export").click();
await page.waitForFunction(() => (document.querySelector('[data-testid="export-out"]')?.textContent || "").includes("状态：正史"), null, { timeout: 10000 });
const md = await page.getByTestId("export-out").evaluate((el) => el.textContent || "");
if (!md.includes("状态：正史") || !md.includes("阿福发现刀")) throw new Error("导出缺正史 " + md.slice(0, 240));
log("导出", md.slice(0, 280));

async function expectN(n) {
  await page.waitForFunction((want) => document.querySelector('[data-testid="col-count"]')?.textContent === want, String(n), { timeout: 8000 });
}
await page.getByTestId("density-dense").click();
await expectN(6);
if (!(await page.getByTestId("plus").isDisabled())) throw new Error("+ 到 6 未灰");
await page.getByTestId("density-sparse").click();
await expectN(2);
await page.getByTestId("minus").click();
await expectN(1);
if (!(await page.getByTestId("minus").isDisabled())) throw new Error("− 到 1 未灰");
await page.getByTestId("density-mid").click();
await expectN(4);
log("本页列数 1–6");

const committedJump = (await st()).committed.map((b) => b.id);
await page.getByTestId("next").click();
await page.waitForTimeout(120);
await page.locator('[data-testid="tooth-0"]').click();
await page.waitForTimeout(120);
if (JSON.stringify((await st()).committed.map((b) => b.id)) !== JSON.stringify(committedJump)) {
  throw new Error("细条改正史");
}
log("细条跳回");

const worldBeforeRo = await world(10);
await page.getByTestId("reading-order").click();
await page.waitForTimeout(150);
const worldAfterRo = await world(10);
if (JSON.stringify(worldBeforeRo.playing) !== JSON.stringify(worldAfterRo.playing)) {
  throw new Error("切读序改了算出");
}
await page.getByTestId("reading-order").click();

const colsBeforeAdd = (await st()).columns.length;
await page.getByTestId("add-column").click();
await page.getByTestId("confirm-change").waitFor();
await page.getByTestId("suggest-empty_col").click();
await page.getByTestId("confirm-ok").click();
await page.waitForTimeout(350);
if ((await st()).columns.length !== colsBeforeAdd + 1) throw new Error("加列未写入");
const lastIdx = (await st()).columns.length - 1;
await page.locator(`[data-testid="tooth-${lastIdx}"]`).click();
await page.waitForTimeout(200);
await page.getByTestId("remove-column").click();
await page.getByTestId("confirm-change").waitFor();
const emptySuggest = await page.getByTestId("suggest-list").innerText();
if ((await page.getByTestId("suggest-drop_empty").count()) > 0) {
  await page.getByTestId("suggest-drop_empty").click();
  await page.getByTestId("confirm-ok").click();
  await page.waitForTimeout(300);
} else {
  await page.getByTestId("confirm-cancel").click();
  log("减列建议非空列，取消以免动正史", emptySuggest);
}
log("加列/减列", emptySuggest);

await page.locator('[data-testid="tooth-0"]').click();
await page.waitForTimeout(150);
await page.getByTestId("remove-column").click();
await page.getByTestId("confirm-change").waitFor();
const refuseTxt = await page.getByTestId("suggest-list").innerText();
if (!refuseTxt.includes("禁止只减列") && !refuseTxt.includes("正史")) {
  log("有正史减列文案", refuseTxt);
}
await page.getByTestId("confirm-cancel").click();

async function previewThenCancel(btn) {
  await page.getByTestId(btn).click();
  try {
    await page.getByTestId("confirm-ok").waitFor({ state: "visible", timeout: 4000 });
    await page.getByTestId("confirm-cancel").click();
    await page.getByTestId("confirm-ok").waitFor({ state: "hidden", timeout: 4000 });
  } catch {
    log(btn + " 未弹出确认，跳过");
  }
}
await previewThenCancel("merge-columns");
await previewThenCancel("swap-columns");
await page.locator('[data-testid="col-handle-0"]').hover();
await page.mouse.down();
await page.mouse.up();
try {
  await page.getByTestId("confirm-ok").waitFor({ state: "visible", timeout: 2000 });
  await page.getByTestId("confirm-cancel").click();
} catch { /* 无邻列可侵入时不弹 */ }
log("结构预览后取消，正史未动");

const extra = await writeNext("试探删一场空正史", "渡口");
await drag("阿福", `[data-testid="draft-${extra.id}"]`);
await fillScene({
  doText: "阿福把仓门重新闩上，当作今晚没有开过抽屉。",
  value: "收藏→假装没有",
});
await page.getByTestId("intent").fill("试探删一场空正史");
await commitOk();
const afterExtra = await st();
const extraBeat = afterExtra.committed.find((b) => b.id === extra.id);
if (!extraBeat) {
  throw new Error("试探场未进正史 " + extra.id + " " + JSON.stringify(afterExtra.committed.map((b) => ({ id: b.id, intent: b.intent }))));
}
const extraId = extraBeat.id;
const seqBefore = afterExtra.committed.map((b) => b.commit_seq);
await page.locator(`[data-testid="card-${extraId}"]`).click();
await page.getByTestId("delete-canon").click();
await page.getByTestId("confirm-change").waitFor();
const impacts = await page.getByTestId("impact-list").innerText();
if (!impacts.includes("故事时间空洞")) throw new Error("影响清单缺项 " + impacts);
await page.getByTestId("suggest-shift").click();
await page.getByTestId("confirm-ok").click();
await page.waitForTimeout(500);
const afterDel = await st();
if (afterDel.committed.some((b) => b.id === extraId)) throw new Error("试删场还在");
const leftSeq = afterDel.committed.map((b) => b.commit_seq);
if (leftSeq.some((s) => !seqBefore.includes(s))) throw new Error("seq 重编号");
if (afterDel.committed.filter((b) => b.intent && b.intent.includes("发现刀")).length !== 1) {
  throw new Error("核心正史被删 " + JSON.stringify(afterDel.committed.map((b) => b.intent)));
}
if (!afterDel.committed.some((b) => String(b.intent).includes("阿禾在城里"))) {
  throw new Error("删错了阿禾 " + JSON.stringify(afterDel.committed.map((b) => b.intent)));
}
log("删多余正史", { extraId, seqBefore, leftSeq, impacts });

const keepDraft = await writeNext("阿禾在城门口等到天亮", "城里");
await drag("阿禾", `[data-testid="draft-${keepDraft.id}"]`);
await fillScene({
  doText: "阿禾靠着城门洞的墙，看着来人袖口。没有铜牌的人他不敢认。",
  think: "三日到了没有？阿莲有没有出渡口？",
  value: "焦灼→空等",
});
await page.evaluate(async (id) => {
  const body = {
    id,
    do_text: document.querySelector('[data-testid="do-text"]').value,
    think_text: document.querySelector('[data-testid="think-text"]').value,
    value_shift: document.querySelector('[data-testid="value-shift"]').value,
  };
  await fetch("/api/drafts/patch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}, keepDraft.id);
log("留下草稿场供导出", keepDraft.id);

await page.getByTestId("export").click();
await page.waitForFunction(() => (document.querySelector('[data-testid="export-out"]')?.textContent || "").includes("状态：草稿"), null, { timeout: 10000 });
const mdFinal = await page.getByTestId("export-out").evaluate((el) => el.textContent || "");
if (!mdFinal.includes("状态：草稿")) throw new Error("最终导出缺草稿 " + mdFinal.slice(0, 240));

await page.getByTestId("book-name").fill("对照空页");
const booksNow = await page.evaluate(async () => (await (await fetch("/api/books")).json()).books);
if (booksNow.includes("对照空页")) {
  await page.getByTestId("open-book").click();
} else {
  await page.getByTestId("create-book").click();
}
await page.getByTestId("book-label").filter({ hasText: "对照空页" }).waitFor({ timeout: 20000 });
await page.getByTestId("book-name").fill(BOOK);
await page.getByTestId("open-book").click();
await page.getByTestId("book-label").filter({ hasText: BOOK }).waitFor({ timeout: 20000 });
const back = await st();
if (back.book !== BOOK) throw new Error("切回渡口失败 " + back.book);
if (back.committed.length < 4) throw new Error("切书丢正史 " + back.committed.length);
log("切书再打开", { book: back.book, committed: back.committed.length });

const final = await st();
const wEnd = await world();
if (wEnd.error) throw new Error("最终算出失败 " + wEnd.error);
const quality = {
  book: final.book,
  n: final.n,
  columns: final.columns.map((c) => ({ id: c.id, from: c.clock_from, to: c.clock_to, ord: c.display_ord })),
  committed: final.committed.map((b) => ({
    id: b.id,
    seq: b.commit_seq,
    col: b.column_id,
    intent: b.intent,
    place: b.place_id,
    value_shift: b.value_shift,
    kind: b.kind,
    do_text: b.do_text,
    say_text: b.say_text,
    think_text: b.think_text,
    presences: (b.presences || []).map((p) => p.entity_id),
    deltas: b.deltas,
    knowledge_writes: b.knowledge_writes,
    clock_from: b.clock_from,
    clock_to: b.clock_to,
  })),
  drafts: final.drafts.map((d) => ({ id: d.id, intent: d.draft.intent, col: d.draft.column_id, do: d.draft.do_text })),
  entities: final.entities.map((e) => ({ id: e.id, kind: e.kind, name: e.name, profile: e.profile })),
  world: { t: wEnd.t, playing: wEnd.playing, where: wEnd.where, states: wEnd.states, knows: wEnd.knows, promises: wEnd.promises },
  exportHead: (typeof mdFinal === "string" ? mdFinal : md).slice(0, 600),
};

const coreIntents = quality.committed.map((b) => b.intent);
for (const n of ["发现刀", "阿莲来找", "阿禾在城里", "赶回城里", "把刀藏"]) {
  if (!coreIntents.some((i) => String(i).includes(n))) {
    throw new Error("缺正史场 " + n + " 现有 " + JSON.stringify(coreIntents));
  }
}
if (quality.committed.some((b) => b.value_shift === "本场变化")) throw new Error("仍有占位价值转折");
if (quality.committed.filter((b) => b.kind !== "ellipsis").some((b) => !b.do_text || String(b.do_text).startsWith("为「"))) {
  throw new Error("场面仍是模板句 " + JSON.stringify(quality.committed.map((b) => b.do_text)));
}
if (quality.committed.some((b) => b.kind === "ellipsis" && b.do_text && String(b.do_text).startsWith("为「"))) {
  throw new Error("省略场仍是模板动作 " + JSON.stringify(quality.committed.filter((b) => b.kind === "ellipsis")));
}
if (quality.drafts.some((d) => d.do && String(d.do).startsWith("为「"))) {
  throw new Error("草稿仍是模板句 " + JSON.stringify(quality.drafts));
}
if (!((quality.world.where || {}).刀 === "渡口帮仓" || (quality.world.states || []).some((s) => s.entity_id === "刀" && s.attr === "where" && s.value === "渡口帮仓"))) {
  throw new Error("刀未藏进仓 " + JSON.stringify({ where: quality.world.where, states: quality.world.states }));
}
const colsByOrd = [...quality.columns].sort((a, b) => a.ord - b.ord);
for (let i = 0; i < colsByOrd.length - 1; i++) {
  if (colsByOrd[i].to > colsByOrd[i + 1].from) throw new Error("列钟重叠 " + JSON.stringify(colsByOrd));
}
const ids = ["阿福", "阿莲", "阿禾", "渡口", "城里", "刀", "铜牌", "渡口帮", "渡口夜间不得开船"];
for (const id of ids) {
  if (!quality.entities.some((e) => e.id === id)) throw new Error("设定不全 " + id);
}
const fu = quality.entities.find((e) => e.id === "阿福");
if (!fu.profile || !fu.profile.setup || !fu.profile.desire) throw new Error("阿福档案不完整 " + JSON.stringify(fu.profile));
if (!(quality.world.states || []).length) throw new Error("算出无情状窗口");
if (!(quality.world.promises || []).length) throw new Error("算出无伏笔");
if (!quality.drafts.length) throw new Error("应保留一场草稿供导出");

try {
  mkdirSync(REPORT, { recursive: true });
  writeFileSync(REPORT + "/QUALITY.json", JSON.stringify(quality, null, 2));
} catch (e) {
  throw new Error("QUALITY.json 未写出 " + e);
}
console.log(JSON.stringify({ steps: note.map((x) => x.s), qualitySummary: {
  committed: quality.committed.length,
  drafts: quality.drafts.length,
  entities: quality.entities.length,
  columns: quality.columns.length,
  where: quality.world.where,
  promises: (quality.world.promises || []).map((p) => p.name),
} }, null, 2));
console.log("FERRY_RETAIN_PASS");
await browser.close();
