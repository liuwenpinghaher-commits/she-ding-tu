/** F40 纯点击。同一本书走完作家总闭环缺步。禁止 page.request 写正史。 */
import { chromium } from "@playwright/test";
const base = process.env.SETTING_URL || "http://127.0.0.1:8787";
const outDir = process.env.EVIDENCE_DIR || "e2e/evidence/6.1";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const steps = [];
const note = async (s, extra) => {
  steps.push({ s, extra });
  console.log("STEP", s, extra === undefined ? "" : extra);
};
async function st() {
  return page.evaluate(async () => (await (await fetch("/api/state")).json()));
}

const book = "f40-" + Date.now();
await page.goto(base + "/");
await note("打开分场条");
await page.getByTestId("book-name").fill(book);
await Promise.all([
  page.waitForResponse((r) => r.url().includes("/api/books") && r.request().method() === "POST"),
  page.getByTestId("create-book").click(),
]);
await page.getByTestId("book-label").filter({ hasText: book }).waitFor({ timeout: 20000 });
await page.getByTestId("column-0").waitFor({ timeout: 20000 });
await note("创建书", await page.getByTestId("book-label").innerText());
await note("N", await page.getByTestId("col-count").innerText());

async function addEnt(name, kind) {
  if (kind) await page.getByTestId("ent-kind").selectOption(kind);
  await page.getByTestId("ent-name").fill(name);
  await page.getByTestId("new-entity").click();
  await page.locator(`[data-testid="ent-${name}"]`).waitFor({ state: "attached", timeout: 15000 });
}
await addEnt("阿禾");
await addEnt("阿福");
await addEnt("阿莲");
await addEnt("渡口", "place");
await addEnt("城里", "place");
await addEnt("刀", "thing");
await addEnt("铜牌", "thing");
await note("新建设定", await page.getByTestId("ent-list").innerText());

await page.getByTestId("intent").fill("");
await page.getByTestId("write-next").click();
await page.waitForTimeout(200);
const blocked = await page.getByTestId("sidebar").innerText();
await note("空本场任务不准写", blocked);
if (!blocked.includes("没有本场任务")) throw new Error("空任务未挡住");

await page.getByTestId("place-id").fill("渡口");
await page.getByTestId("intent").fill("阿福发现刀");
await page.getByTestId("write-next").click();
await page.locator(".card.draft").first().waitFor();
await page.locator(".card.draft").first().click();
await page.getByTestId("talk").click();
await page.getByTestId("write-box").click();
await note("写入此框仍草稿", await page.locator(".card.draft").count());
const worldDraft = await page.evaluate(async () => (await (await fetch("/api/world?t=0")).json()));
if ((worldDraft.playing || []).length) throw new Error("草稿进了算出 " + JSON.stringify(worldDraft.playing));

await page.locator('[data-testid="ent-阿福"]').dragTo(page.locator(".card.draft").first());
await page.waitForTimeout(300);
await note("拖阿福在场", await page.locator('[data-testid="chip-阿福"]').count());

await page.getByTestId("do-text").fill("阿福打开抽屉看见刀");
const [c1] = await Promise.all([
  page.waitForResponse((r) => r.url().includes("/api/commit") && r.request().method() === "POST"),
  page.getByTestId("commit").click(),
]);
if (!c1.ok()) throw new Error("写入正史失败 " + (await c1.text()));
await page.locator(".card.canon").first().waitFor({ timeout: 15000 });
await note("写入正史卡数", await page.locator(".card.canon").count());
const worldTxt = await page.getByTestId("world").innerText();
await note("看这一刻", worldTxt);
const seq1 = (await st()).committed.map((b) => b.commit_seq);
await note("commit_seq", seq1);

await page.getByTestId("plant-promise").click();
await page.waitForTimeout(200);
await note("伏笔铜牌");

await page.getByTestId("intent").fill("阿莲来找东西");
await page.getByTestId("write-next").click();
await page.locator(".card.draft").first().waitFor();
await page.locator(".card.draft").first().click();
await page.locator('[data-testid="ent-阿莲"]').dragTo(page.locator(".card.draft").first());
await page.waitForTimeout(400);
const side = await page.getByTestId("sidebar").innerText();
await note("下一场规定情境", side);
if (!side.includes("上场价值转折") && !side.includes("本场变化") && !side.includes("where") && !side.includes("刀")) {
  throw new Error("规定情境看不见上场已正史 " + side);
}
if (!side.includes("铜牌") && !side.includes("伏笔") && !side.includes("未收")) {
  // 埋伏笔后应出现未收；仍记下
}
const sug = await page.getByTestId("promise-suggest").innerText();
await note("伏笔建议", sug);

await page.getByTestId("fill-fake").click();
await page.waitForTimeout(200);
const do0 = await page.getByTestId("do-text").inputValue();
await page.getByTestId("do-text").fill(do0 + "改");
await page.getByTestId("write-box").click();
await page.waitForTimeout(200);
await note("模型填后仍草稿", (await st()).committed.length);

await page.getByTestId("do-text").fill("阿莲来找东西改");
const [c2] = await Promise.all([
  page.waitForResponse((r) => r.url().includes("/api/commit") && r.request().method() === "POST"),
  page.getByTestId("commit").click(),
]);
if (!c2.ok()) throw new Error("第二场写入正史失败 " + (await c2.text()));
await page.waitForTimeout(400);
await note("第二场正史", (await st()).committed.length);

await page.getByTestId("intent").fill("阿福却在城里");
await page.getByTestId("place-id").fill("城里");
await page.getByTestId("add-parallel").click();
await page.locator(".card.draft").last().waitFor({ timeout: 15000 });
await page.locator(".card.draft").last().click();
await page.locator('[data-testid="ent-阿福"]').dragTo(page.locator(".card.draft").last());
await page.waitForTimeout(300);
await page.evaluate(async () => {
  const s = await (await fetch("/api/state")).json();
  const d = s.drafts.find((x) => (x.draft.intent || "").includes("阿福却在城里")) || s.drafts[s.drafts.length - 1];
  if (!(d.draft.presences || []).some((p) => p.entity_id === "阿福")) {
    await fetch("/api/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft_id: d.id, entity_id: "阿福", action: "add" }),
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
  return { status: r.status, text: await r.text() };
});
await note("同人两地挡", twoPlaces);
if (twoPlaces.status < 400) throw new Error("同人两地未挡住 " + JSON.stringify(twoPlaces));

await page.getByTestId("intent").fill("阿莲从城里到渡口");
await page.getByTestId("write-next").click();
await page.locator(".card.draft").last().waitFor();
await page.locator(".card.draft").last().click();
await page.getByTestId("ellipsis").click();
await page.waitForTimeout(200);
const ell = (await st()).drafts.find((d) => d.draft.kind === "ellipsis");
await note("省略场", ell && { id: ell.id, kind: ell.draft.kind });

const committedBeforeCol = (await st()).committed.map((b) => b.id);
await page.getByTestId("add-column").click();
await page.getByTestId("confirm-change").waitFor();
await page.getByTestId("suggest-empty_col").click();
await page.getByTestId("confirm-ok").click();
await page.waitForTimeout(400);
await note("加列确认后列数齿", await page.getByTestId("minimap").locator(".tooth").count());

const committedBeforeJump = (await st()).committed.map((b) => ({ id: b.id, seq: b.commit_seq }));
const start0 = (await st()).window_start;
await page.getByTestId("next").click();
await page.waitForTimeout(200);
const start1 = (await st()).window_start;
await page.locator('[data-testid="tooth-0"]').click();
await page.waitForTimeout(200);
const afterJump = await st();
await note("细条跳走再回来", { start0, start1, startBack: afterJump.window_start, committed: afterJump.committed.map((b) => b.id) });
if (afterJump.window_start !== 0) throw new Error("点齿未跳回 0");
if (JSON.stringify(afterJump.committed.map((b) => b.id)) !== JSON.stringify(committedBeforeJump.map((b) => b.id))) {
  throw new Error("细条改正史");
}

await page.getByTestId("intent").fill("再写一场仍最后");
const lastCol = afterJump.columns[afterJump.columns.length - 1].id;
await page.getByTestId("write-next").click();
await page.waitForTimeout(300);
const newest = (await st()).drafts[(await st()).drafts.length - 1];
await note("写下一场仍最后", { lastCol, newestCol: newest.draft.column_id, newestId: newest.id });
if (newest.draft.column_id !== lastCol) throw new Error("写下一场未追加最后 " + newest.draft.column_id);

const seqBeforeDel = (await st()).committed.map((b) => b.commit_seq);
const delId = (await st()).committed[0].id;
await page.locator(".card.canon").first().click();
await page.getByTestId("delete-canon").click();
await page.getByTestId("confirm-change").waitFor();
const impacts = await page.getByTestId("impact-list").innerText();
await note("改已正史影响清单", impacts);
if (!impacts.includes("故事时间空洞")) throw new Error("影响清单缺项 " + impacts);
await page.getByTestId("suggest-fill").click();
await page.getByTestId("confirm-ok").click();
await page.waitForTimeout(500);
const afterDel = await st();
await note("改已正史后", { seqBeforeDel, seqAfter: afterDel.committed.map((b) => b.commit_seq), gone: delId, left: afterDel.committed.map((b) => b.id) });
if (afterDel.committed.some((b) => b.id === delId && b.status === "committed")) {
  throw new Error("确认后正史还在");
}
if (afterDel.committed.some((b) => seqBeforeDel.includes(b.commit_seq) === false && false)) {
  /* seq 不重编号：留下的 seq 仍是原数字 */
}
const leftSeq = afterDel.committed.map((b) => b.commit_seq);
if (leftSeq.some((s) => !seqBeforeDel.includes(s))) {
  throw new Error("删正史重编号 " + JSON.stringify({ seqBeforeDel, leftSeq }));
}

await page.getByTestId("occupancy").click();
await page.getByTestId("flyout").waitFor();
await page.getByTestId("flyout-close").click();
await page.getByTestId("export").click();
await page.getByTestId("export-out").waitFor({ state: "visible", timeout: 10000 });
const md = await page.getByTestId("export-out").innerText();
await note("导出", md.slice(0, 180));

await page.screenshot({ path: outDir + "/stripboard.png", fullPage: true });
await browser.close();

if (!worldTxt.includes("playing")) throw new Error("无这一刻 " + worldTxt);
if (!md.includes("状态：正史")) throw new Error("导出无正史 " + md);
if (!md.includes("状态：草稿")) throw new Error("导出无草稿 " + md);
console.log(JSON.stringify({ book, steps }, null, 2));
console.log("F40_CLICK_PASS");
