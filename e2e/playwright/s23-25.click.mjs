/** 切片 2.3 / 2.4 / 2.5 纯点击。 */
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

const bookA = "openA-" + Date.now();
const bookB = "openB-" + Date.now();
await page.goto(base + "/");
await page.getByTestId("book-name").fill(bookA);
await Promise.all([
  page.waitForResponse((r) => r.url().includes("/api/books") && r.request().method() === "POST"),
  page.getByTestId("create-book").click(),
]);
await page.getByTestId("book-label").filter({ hasText: bookA }).waitFor({ timeout: 20000 });
await page.getByTestId("column-0").waitFor();

await addEnt("阿福");
await page.getByTestId("intent").fill("阿福发现刀");
await page.getByTestId("write-next").click();
await page.locator(".card.draft").first().waitFor();
await page.getByTestId("commit").click();
await page.locator(".card.canon").first().waitFor({ timeout: 15000 });

await page.getByTestId("add-column").click();
await page.getByTestId("confirm-change").waitFor();
await page.getByTestId("suggest-empty_col").click();
await page.getByTestId("confirm-ok").click();
await page.waitForTimeout(400);
await page.getByTestId("density-mid").click();
await page.waitForTimeout(200);

await page.getByTestId("intent").fill("阿莲来找东西");
await page.getByTestId("write-next").click();
await page.locator(".card.draft").first().waitFor({ timeout: 15000 });

const beforeSwitch = await page.evaluate(async () => {
  const s = await (await fetch("/api/state")).json();
  const teeth = [...document.querySelectorAll(".tooth")].map((el) => el.className);
  return {
    book: s.book,
    committed: s.committed.map((b) => b.id),
    drafts: s.drafts.map((d) => d.id),
    teeth,
    playing: s.world && s.world.playing,
  };
});

await page.getByTestId("book-name").fill(bookB);
await Promise.all([
  page.waitForResponse((r) => r.url().includes("/api/books") && r.request().method() === "POST"),
  page.getByTestId("create-book").click(),
]);
await page.getByTestId("book-label").filter({ hasText: bookB }).waitFor({ timeout: 20000 });

await page.getByTestId("book-name").fill(bookA);
await page.getByTestId("open-book").click();
await page.getByTestId("book-label").filter({ hasText: bookA }).waitFor({ timeout: 20000 });
await page.waitForTimeout(400);

const afterOpen = await page.evaluate(async () => {
  const s = await (await fetch("/api/state")).json();
  const teeth = [...document.querySelectorAll(".tooth")].map((el, i) => ({
    i,
    className: el.className,
    testid: el.getAttribute("data-testid"),
  }));
  return {
    book: s.book,
    committed: s.committed.map((b) => ({ id: b.id, status: b.status })),
    drafts: s.drafts.map((d) => d.id),
    teeth,
    canonCards: document.querySelectorAll(".card.canon").length,
    draftCards: document.querySelectorAll(".card.draft").length,
    playing: s.world && s.world.playing,
  };
});

if (afterOpen.book !== bookA) throw new Error("打开书名 " + afterOpen.book);
if (afterOpen.canonCards < 1) throw new Error("打开后看不见正史卡");
if (afterOpen.draftCards < 1) throw new Error("打开后看不见草稿卡");
const t0 = afterOpen.teeth[0];
if (!t0.className.includes("canon")) throw new Error("正史列齿色 " + t0.className);
const draftTooth = afterOpen.teeth.find((t) => t.className.includes("draft") && !t.className.includes("canon"));
if (!draftTooth) throw new Error("没有仅草稿齿色 " + JSON.stringify(afterOpen.teeth));
if ((afterOpen.playing || []).some((id) => afterOpen.drafts.includes(id))) {
  throw new Error("草稿进了算出 " + JSON.stringify(afterOpen.playing));
}

// 2.4 列数
await page.getByTestId("density-dense").click();
await page.waitForTimeout(200);
let n = await page.getByTestId("col-count").innerText();
if (n !== "6") throw new Error("密应为 6 得到 " + n);
const plusDis = await page.getByTestId("plus").isDisabled();
if (!plusDis) throw new Error("+ 到 6 未灰");
await page.getByTestId("density-sparse").click();
await page.waitForTimeout(200);
n = await page.getByTestId("col-count").innerText();
if (n !== "2") throw new Error("疏应为 2 得到 " + n);
await page.getByTestId("minus").click();
await page.waitForTimeout(200);
n = await page.getByTestId("col-count").innerText();
if (n !== "1") throw new Error("− 到 1 得到 " + n);
const minusDis = await page.getByTestId("minus").isDisabled();
if (!minusDis) throw new Error("− 到 1 未灰");
await page.getByTestId("density-mid").click();
await page.waitForTimeout(200);
n = await page.getByTestId("col-count").innerText();
if (n !== "4") throw new Error("中应为 4 得到 " + n);

// 2.5 细条只跳窗口
const worldBefore = await page.evaluate(async () => {
  const w = await (await fetch("/api/world?t=0")).json();
  const s = await (await fetch("/api/state")).json();
  return { playing: w.playing, committed: s.committed.length, start: s.window_start };
});
await page.getByTestId("next").click();
await page.waitForTimeout(200);
const afterNext = await page.evaluate(async () => {
  const w = await (await fetch("/api/world?t=0")).json();
  const s = await (await fetch("/api/state")).json();
  return { playing: w.playing, committed: s.committed.length, start: s.window_start };
});
await page.locator('[data-testid="tooth-0"]').click();
await page.waitForTimeout(200);
const afterTooth = await page.evaluate(async () => {
  const w = await (await fetch("/api/world?t=0")).json();
  const s = await (await fetch("/api/state")).json();
  return { playing: w.playing, committed: s.committed.length, start: s.window_start };
});
if (JSON.stringify(afterNext.playing) !== JSON.stringify(worldBefore.playing)) {
  throw new Error("‹› 改了算出");
}
if (afterNext.committed !== worldBefore.committed) throw new Error("‹› 改正史场数");
if (afterTooth.start !== 0) throw new Error("点齿未跳回 0 得到 " + afterTooth.start);

const out = {
  bookA,
  bookB,
  beforeSwitch,
  afterOpen,
  n24: { dense6: "6", plusDisabled: plusDis, sparse2: "2", minus1: n === "4" ? "ok-mid" : n, minusDisabled: minusDis, mid4: n },
  n25: { worldBefore, afterNext, afterTooth },
};
console.log(JSON.stringify(out, null, 2));
console.log("S23_25_PASS");
await browser.close();
