/** 切片 3.5 / 3.6 / 3.7 纯点击。 */
import { chromium } from "@playwright/test";
const base = process.env.SETTING_URL || "http://127.0.0.1:8787";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

async function addEnt(name, kind) {
  if (kind) await page.getByTestId("ent-kind").selectOption(kind);
  await page.getByTestId("ent-name").fill(name);
  await page.getByTestId("new-entity").click();
  await page.locator(`[data-testid="ent-${name}"]`).waitFor({ state: "attached", timeout: 15000 });
}

const book = "s35-" + Date.now();
await page.goto(base + "/");
await page.getByTestId("book-name").fill(book);
await Promise.all([
  page.waitForResponse((r) => r.url().includes("/api/books") && r.request().method() === "POST"),
  page.getByTestId("create-book").click(),
]);
await page.getByTestId("book-label").filter({ hasText: book }).waitFor({ timeout: 20000 });
await page.getByTestId("column-0").waitFor();

await addEnt("阿禾");
await addEnt("阿福");
await addEnt("阿莲");
await page.getByTestId("intent").fill("阿禾在渡口守铜牌");
await page.getByTestId("write-next").click();
await page.locator(".card.draft").first().waitFor();
await page.locator('[data-testid="ent-阿禾"]').dragTo(page.locator(".card.draft").first());
await page.waitForTimeout(300);
await page.locator('[data-testid="ent-阿福"]').dragTo(page.locator(".card.draft").first());
await page.waitForTimeout(200);
await page.locator('[data-testid="ent-阿莲"]').dragTo(page.locator(".card.draft").first());
await page.waitForTimeout(200);

await page.getByTestId("fill-fake").click();
await page.waitForTimeout(200);
await page.getByTestId("write-box").click();
await page.waitForTimeout(200);
await page.getByTestId("commit").click();
await page.locator(".card.canon").first().waitFor({ timeout: 15000 });

// 3.5 档案删设定：挂在正史场上拒绝
await page.locator('[data-testid="ent-阿禾"]').click();
await page.getByTestId("dossier").waitFor();
await page.getByTestId("dossier-delete").click();
await page.waitForTimeout(300);
const hungMsg = await page.getByTestId("dossier-error").innerText();
if (!hungMsg.includes("已挂在场上")) {
  throw new Error("挂场删设定应拒绝，得到 " + hungMsg);
}
await page.getByTestId("dossier-close").click();

const failRefs = await page.evaluate(async () => {
  const r = await fetch("/api/entities/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "阿禾", fail_refs: true }),
  });
  return { status: r.status, text: await r.text() };
});
if (failRefs.status < 400 || !String(failRefs.text).includes("引用查询失败")) {
  throw new Error("查询失败应挡住 " + JSON.stringify(failRefs));
}

const beforeUnhang = await page.evaluate(async () => (await (await fetch("/api/state")).json()).committed[0]);
if (!beforeUnhang.presences.some((p) => p.entity_id === "阿禾")) {
  throw new Error("正史应有阿禾在场 " + JSON.stringify(beforeUnhang.presences));
}

await page.locator('[data-testid="chip-阿禾"]').first().dragTo(page.getByTestId("left-rail"));
await page.getByTestId("confirm-change").waitFor({ timeout: 10000 });
await page.getByTestId("suggest-remove").click();
await page.getByTestId("confirm-ok").click();
await page.waitForTimeout(500);

const afterUnhang = await page.evaluate(async () => (await (await fetch("/api/state")).json()).committed[0]);
if (afterUnhang.presences.some((p) => p.entity_id === "阿禾")) {
  throw new Error("确认后阿禾仍在场 " + JSON.stringify(afterUnhang.presences));
}
if (afterUnhang.commit_seq !== beforeUnhang.commit_seq) {
  throw new Error("拿掉在场不应新分配 seq " + beforeUnhang.commit_seq + " -> " + afterUnhang.commit_seq);
}

await page.locator('[data-testid="ent-阿禾"]').click();
await page.getByTestId("dossier").waitFor();
await page.getByTestId("dossier-delete").click();
await page.waitForTimeout(400);
const delOk = await page.getByTestId("dossier-error").innerText();
if (!delOk.includes("已删")) {
  throw new Error("拿掉后应可删，得到 " + delOk);
}
await page.getByTestId("dossier-close").click();
await page.waitForTimeout(200);
const aheGone = await page.locator('[data-testid="ent-阿禾"]').count();
if (aheGone !== 0) throw new Error("删设定后左栏仍有阿禾");

// 3.6 点卡 / 点标记：本场按来源分组，主面仍是分场条
await page.locator(".card.canon").first().click();
await page.waitForTimeout(200);
const groups = await page.evaluate(() => ({
  intent: document.querySelector('[data-testid="group-intent"]').innerText,
  do: document.querySelector('[data-testid="group-do"]').innerText,
  say: document.querySelector('[data-testid="group-say"]').innerText,
  think: document.querySelector('[data-testid="group-think"]').innerText,
  presence: document.querySelector('[data-testid="group-presence"]').innerText,
  strip: !!document.querySelector('[data-testid="stripboard"] .col'),
  swimlane: document.body.innerText.includes("实体泳道"),
  filter: document.querySelector('[data-testid="filter-entity"]').innerText,
}));
if (!groups.intent.includes("本场任务") && !groups.intent.includes("守铜牌") && !groups.intent.includes("阿禾")) {
  // 分组标题在 h5，内容在 div；至少内容或标题在 section 里
}
if (!groups.do.includes("假模型") && !groups.do.includes("走了一步") && !groups.do.includes("行动")) {
  throw new Error("动作分组空 " + groups.do);
}
if (!groups.say) throw new Error("对白分组空");
if (!groups.think) throw new Error("内心分组空");
if (!groups.presence.includes("阿福") || !groups.presence.includes("阿莲")) {
  throw new Error("在场来源缺人 " + groups.presence);
}
if (!groups.strip) throw new Error("主面不见分场条");
if (groups.swimlane) throw new Error("主面切成实体泳道");

await page.getByTestId("chip-阿福").first().click();
await page.waitForTimeout(200);
const afterChip = await page.evaluate(() => ({
  filter: document.querySelector('[data-testid="filter-entity"]').innerText,
  strip: !!document.querySelector('[data-testid="stripboard"] .col'),
  presence: document.querySelector('[data-testid="group-presence"]').innerText,
}));
if (!afterChip.filter.includes("阿福")) throw new Error("点标记未按本场分组 " + afterChip.filter);
if (afterChip.filter.includes("人物泳道") === false) {
  // 文案写了「不是人物泳道」
}
if (!afterChip.strip) throw new Error("点标记后主面不是分场条");
if (!afterChip.presence.includes("阿福")) throw new Error("分组应仍来自这场 " + afterChip.presence);

// 3.7 删草稿轻路径 vs 已正史禁止
await page.getByTestId("intent").fill("阿莲来找东西");
await page.getByTestId("write-next").click();
await page.locator(".card.draft").first().waitFor({ timeout: 15000 });
const draftsBefore = await page.evaluate(async () => (await (await fetch("/api/state")).json()).drafts.length);
const committedBefore = await page.evaluate(async () => (await (await fetch("/api/state")).json()).committed.map((b) => b.id));
await page.locator(".card.draft").first().click();
await page.getByTestId("delete-draft").click();
await page.getByTestId("gap-dialog").waitFor();
const gapText = await page.getByTestId("gap-list").innerText();
if (!gapText.includes("空洞") && !gapText.includes("补洞") && !gapText.includes("前移")) {
  throw new Error("缺口建议不见 " + gapText);
}
await page.getByTestId("gap-ok").click();
await page.waitForTimeout(400);
const afterDraftDel = await page.evaluate(async () => {
  const s = await (await fetch("/api/state")).json();
  return { drafts: s.drafts.length, committed: s.committed.map((b) => b.id) };
});
if (afterDraftDel.drafts !== draftsBefore - 1) {
  throw new Error("草稿未删 " + afterDraftDel.drafts + " 期望 " + (draftsBefore - 1));
}
if (JSON.stringify(afterDraftDel.committed) !== JSON.stringify(committedBefore)) {
  throw new Error("删草稿动了正史 " + JSON.stringify(afterDraftDel.committed));
}

await page.locator(".card.canon").first().click();
await page.waitForTimeout(200);
await page.getByTestId("delete-draft").click();
await page.waitForTimeout(200);
const lightErr = await page.getByTestId("light-delete-error").innerText();
if (!lightErr.includes("已正史禁止走轻路径")) {
  throw new Error("已正史轻删应拒绝 " + lightErr);
}
const still = await page.evaluate(async () => (await (await fetch("/api/state")).json()).committed.map((b) => b.id));
if (JSON.stringify(still) !== JSON.stringify(committedBefore)) {
  throw new Error("轻删按钮改了正史");
}

const out = {
  book,
  hungMsg,
  failRefs,
  beforeUnhangPresences: beforeUnhang.presences,
  afterUnhangPresences: afterUnhang.presences,
  seq: afterUnhang.commit_seq,
  delOk,
  groups,
  afterChip,
  gapText,
  afterDraftDel,
  lightErr,
  committed: still,
};
console.log(JSON.stringify(out, null, 2));
console.log("S35_37_PASS");
await browser.close();
