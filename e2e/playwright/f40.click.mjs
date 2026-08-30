/** F40 纯点击。禁止 page.request 写正史。 */
import { chromium } from "@playwright/test";
const base = process.env.SETTING_URL || "http://127.0.0.1:8787";
const out = process.env.EVIDENCE_DIR || "e2e/evidence/6.1";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const steps = [];
const note = async (s, extra) => {
  steps.push({ s, extra });
  console.log("STEP", s, extra || "");
};

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
  await page.getByTestId("ent-name").evaluate((el, n) => { el.value = n; }, name);
  await page.getByTestId("new-entity").click();
  await page.locator(`[data-testid="ent-${name}"]`).waitFor({ state: "attached", timeout: 15000 });
}
await addEnt("阿禾");
await addEnt("阿福");
await addEnt("阿莲");
await addEnt("渡口", "place");
await note("新建设定", await page.getByTestId("ent-list").innerText());

await page.getByTestId("intent").fill("");
await page.getByTestId("write-next").click();
await page.waitForTimeout(200);
const blocked = await page.getByTestId("sidebar").innerText();
await note("空本场任务不准写", blocked);

await page.getByTestId("intent").fill("阿福发现刀");
await page.getByTestId("write-next").click();
await page.locator(".card.draft").first().waitFor();
await page.locator(".card.draft").first().click();
await page.getByTestId("talk").click();
await page.getByTestId("write-box").click();
await note("写入此框仍草稿", await page.locator(".card.draft").count());

await page.locator('[data-testid="ent-阿福"]').dragTo(page.locator(".card.draft").first());
await page.waitForTimeout(300);
await note("拖阿福在场", await page.locator('[data-testid="chip-阿福"]').count());

await page.getByTestId("commit").click();
await page.locator(".card.canon").first().waitFor({ timeout: 15000 });
await note("写入正史卡数", await page.locator(".card.canon").count());
const worldTxt = await page.getByTestId("world").innerText();
await note("看这一刻", worldTxt);

await page.getByTestId("intent").fill("阿莲来找东西");
await page.getByTestId("write-next").click();
await page.locator(".card.draft").first().waitFor();
await note("写下一场追加", await page.locator(".card.draft").count());

await page.getByTestId("ellipsis").click();
await page.waitForTimeout(200);
await note("省略场");

await page.getByTestId("add-column").click();
await page.getByTestId("confirm-change").waitFor();
await page.getByTestId("suggest-empty_col").click();
await page.getByTestId("confirm-ok").click();
await page.waitForTimeout(400);
await note("加列确认后列数齿", await page.getByTestId("minimap").locator(".tooth").count());

await page.getByTestId("occupancy").click();
await page.getByTestId("flyout").waitFor();
await page.getByTestId("flyout-close").click();
await page.getByTestId("export").click();
await page.getByTestId("export-out").waitFor({ state: "visible", timeout: 10000 });
const md = await page.getByTestId("export-out").innerText();
await note("导出", md.slice(0, 120));

await page.screenshot({ path: out + "/stripboard.png", fullPage: true });
await browser.close();

if (!worldTxt.includes("playing")) throw new Error("无这一刻 " + worldTxt);
if (!md.includes("状态：正史")) throw new Error("导出无正史 " + md);
console.log(JSON.stringify(steps, null, 2));
console.log("F40_CLICK_PASS");
