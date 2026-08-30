/** 点击：加载可见列、写入正史不抹列、拖在场、确认变更取消不写库、档案。 */
import { chromium } from "@playwright/test";
const base = process.env.SETTING_URL || "http://127.0.0.1:8787";
const shot = process.env.SHOT || "e2e/evidence/2.1/stripboard.png";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const book = "feat-" + Date.now();
await page.goto(base + "/");
await page.getByTestId("book-name").fill(book);
await page.getByTestId("create-book").click();
await page.getByTestId("column-0").waitFor({ timeout: 20000 });
await page.screenshot({ path: shot, fullPage: true });
const colVisible = await page.locator('[data-testid=column-0]').isVisible();
if (!colVisible) throw new Error("加载后看不见列");

await page.getByTestId("ent-name").fill("阿福");
await page.getByTestId("new-entity").click();
await page.locator('[data-testid="ent-阿福"]').waitFor();
await page.getByTestId("ent-kind").selectOption("place");
await page.getByTestId("ent-name").fill("渡口");
await page.getByTestId("new-entity").click();
await page.locator('[data-testid="ent-渡口"]').waitFor();

await page.getByTestId("intent").fill("阿福发现刀");
await page.getByTestId("write-next").click();
await page.locator(".card.draft").first().waitFor();
const before = await page.evaluate(async () => {
  const s = await (await fetch("/api/state")).json();
  return s.drafts[0].draft;
});
await page.locator('[data-testid="ent-阿福"]').dragTo(page.locator(".card.draft").first());
await page.waitForTimeout(300);
const afterDrag = await page.evaluate(async () => {
  const s = await (await fetch("/api/state")).json();
  return s.drafts[0].draft;
});
if (!afterDrag.presences.some((p) => p.entity_id === "阿福")) {
  throw new Error("拖入后在场没有阿福 " + JSON.stringify(afterDrag.presences));
}
if (afterDrag.column_id !== before.column_id) throw new Error("拖在场改了列");

await page.getByTestId("commit").click();
await page.locator(".card.canon").first().waitFor({ timeout: 15000 });
const committed = await page.evaluate(async () => {
  const s = await (await fetch("/api/state")).json();
  return s.committed[0];
});
if (committed.column_id !== before.column_id) {
  throw new Error("写入正史抹掉列 " + committed.column_id);
}
if (!committed.presences.some((p) => p.entity_id === "阿福")) {
  throw new Error("写入正史抹掉在场 " + JSON.stringify(committed.presences));
}

const colsBefore = await page.evaluate(async () => (await (await fetch("/api/state")).json()).columns);
await page.getByTestId("add-column").click();
await page.getByTestId("confirm-change").waitFor();
await page.getByTestId("confirm-cancel").click();
await page.waitForTimeout(200);
const colsCancel = await page.evaluate(async () => (await (await fetch("/api/state")).json()).columns);
if (colsCancel.length !== colsBefore.length) throw new Error("取消加列仍写库 " + colsCancel.length);

await page.getByTestId("add-column").click();
await page.getByTestId("suggest-empty_col").click();
await page.getByTestId("confirm-ok").click();
await page.waitForTimeout(400);
const colsOk = await page.evaluate(async () => (await (await fetch("/api/state")).json()).columns);
if (colsOk.length !== colsBefore.length + 1) throw new Error("确认加列未写库 " + colsOk.length);

await page.locator('[data-testid="ent-阿福"]').click();
await page.getByTestId("dossier").waitFor();
await page.getByTestId("dossier-desire").fill("守住铜牌");
await page.getByTestId("dossier-save").click();
await page.getByTestId("dossier-close").click();

await page.getByTestId("intent").fill("");
const draftsBefore = await page.locator(".card.draft").count();
await page.getByTestId("write-next").click();
await page.waitForTimeout(200);
const draftsAfter = await page.locator(".card.draft").count();
if (draftsAfter !== draftsBefore) throw new Error("空任务仍写下一场");

console.log(JSON.stringify({
  colVisible,
  column_id: committed.column_id,
  presences: committed.presences,
  colsBefore: colsBefore.length,
  colsCancel: colsCancel.length,
  colsOk: colsOk.length,
  emptyIntentBlocked: draftsAfter === draftsBefore,
}, null, 2));
console.log("FEATURES_CLICK_PASS");
await browser.close();
