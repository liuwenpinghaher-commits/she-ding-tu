/** 切片 3.4 拖列侵入 + 4.4 加列按 choice 分叉。纯点击。 */
import { chromium } from "@playwright/test";
const base = process.env.SETTING_URL || "http://127.0.0.1:8787";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
async function state() {
  return page.evaluate(async () => (await (await fetch("/api/state")).json()));
}
async function clocks() {
  const s = await state();
  return s.columns.map((c) => ({ id: c.id, from: c.clock_from, to: c.clock_to, ord: c.display_ord }));
}

const book = "s3444-" + Date.now();
await page.goto(base + "/");
await page.getByTestId("book-name").fill(book);
await Promise.all([
  page.waitForResponse((r) => r.url().includes("/api/books") && r.request().method() === "POST"),
  page.getByTestId("create-book").click(),
]);
await page.getByTestId("column-0").waitFor({ timeout: 20000 });

const beforePlus = (await state()).columns.length;
const n0 = await page.getByTestId("col-count").innerText();
await page.getByTestId("plus").click();
await page.waitForTimeout(150);
const n1 = await page.getByTestId("col-count").innerText();
const afterPlusCols = (await state()).columns.length;
if (afterPlusCols !== beforePlus) throw new Error("顶栏+改了故事列");
if (n1 === n0) throw new Error("顶栏+未改本页列数");

const clocks0 = await clocks();
await page.getByTestId("add-column").click();
await page.getByTestId("confirm-change").waitFor();
const addSuggest = await page.getByTestId("suggest-list").innerText();
for (const k of ["empty_col", "empty_beat", "shift", "borrow", "cancel"]) {
  if (!(await page.getByTestId("suggest-" + k).count())) {
    throw new Error("加列缺建议 " + k + " " + addSuggest);
  }
}
await page.getByTestId("confirm-cancel").click();
await page.waitForTimeout(200);
const clocksCancelAdd = await clocks();
if (JSON.stringify(clocksCancelAdd) !== JSON.stringify(clocks0)) {
  throw new Error("取消加列仍改钟 " + JSON.stringify(clocksCancelAdd));
}

await page.getByTestId("add-column").click();
await page.getByTestId("suggest-empty_col").click();
await page.getByTestId("confirm-ok").click();
await page.waitForTimeout(400);
const afterEmpty = await clocks();
if (afterEmpty.length !== clocks0.length + 1) throw new Error("empty_col 未加列 " + JSON.stringify(afterEmpty));
const emptyNew = afterEmpty.find((c) => !clocks0.some((o) => o.id === c.id));
const col0AfterEmpty = afterEmpty.find((c) => c.id === clocks0[0].id);
if (col0AfterEmpty.from !== clocks0[0].from || col0AfterEmpty.to !== clocks0[0].to) {
  throw new Error("empty_col 不该改已有列钟 " + JSON.stringify({ clocks0, afterEmpty }));
}

const col1BeforeShift = afterEmpty.find((c) => c.id !== clocks0[0].id);
await page.getByTestId("prev").click().catch(() => {});
await page.waitForTimeout(100);
// 窗口停在 col0，中间加列 + shift 应后移后续列
await page.locator('[data-testid="tooth-0"]').click();
await page.waitForTimeout(150);
await page.getByTestId("add-column").click();
await page.getByTestId("suggest-shift").click();
await page.getByTestId("confirm-ok").click();
await page.waitForTimeout(400);
const afterShift = await clocks();
const shifted = afterShift.find((c) => c.id === col1BeforeShift.id);
if (!shifted) throw new Error("shift 后找不到原后续列 " + JSON.stringify(afterShift));
if (shifted.from <= col1BeforeShift.from) {
  throw new Error("shift 后续列 clock_from 未后移 " + JSON.stringify({ col1BeforeShift, shifted, afterShift }));
}
if (shifted.from === emptyNew.from && shifted.to === emptyNew.to) {
  throw new Error("shift 与 empty_col 落点相同");
}

const out44 = { n0, n1, afterPlusCols, clocks0, afterEmpty, afterShift, col1BeforeShift, shifted, addSuggest };

// 3.4 拖列侵入：至少两列（上面已有）
const clocksBeforeInvade = await clocks();
if (clocksBeforeInvade.length < 2) throw new Error("侵入前应有两列");
await page.locator('[data-testid="tooth-0"]').click();
await page.waitForTimeout(150);
await page.getByTestId("col-handle-0").dispatchEvent("mousedown");
await page.getByTestId("confirm-change").waitFor({ timeout: 10000 });
const invadeSuggest = await page.getByTestId("suggest-list").innerText();
for (const k of ["compress", "shift", "merge", "empty", "parallel", "cancel"]) {
  if (!(await page.getByTestId("suggest-" + k).count())) {
    throw new Error("侵入缺建议 " + k + " " + invadeSuggest);
  }
}
if (invadeSuggest.includes("本页列数") || invadeSuggest.includes("顶栏")) {
  throw new Error("侵入对话框混进顶栏+");
}
await page.getByTestId("confirm-cancel").click();
await page.waitForTimeout(200);
const clocksCancelInvade = await clocks();
if (JSON.stringify(clocksCancelInvade) !== JSON.stringify(clocksBeforeInvade)) {
  throw new Error("取消侵入改了钟 " + JSON.stringify({ clocksBeforeInvade, clocksCancelInvade }));
}

await page.getByTestId("col-handle-0").dispatchEvent("mousedown");
await page.getByTestId("confirm-change").waitFor();
await page.getByTestId("suggest-compress").click();
await page.getByTestId("confirm-ok").click();
await page.waitForTimeout(400);
const clocksCompress = await clocks();
const sorted = [...clocksCompress].sort((a, b) => a.from - b.from);
for (let i = 0; i < sorted.length - 1; i++) {
  if (sorted[i].to > sorted[i + 1].from) {
    throw new Error("确认侵入后钟重叠 " + JSON.stringify(clocksCompress));
  }
}
if (JSON.stringify(clocksCompress) === JSON.stringify(clocksBeforeInvade)) {
  throw new Error("确认压缩钟未变");
}

const out34 = { clocksBeforeInvade, clocksCancelInvade, clocksCompress, invadeSuggest };
console.log(JSON.stringify({ book, out44, out34 }, null, 2));
console.log("S34_44_PASS");
await browser.close();
