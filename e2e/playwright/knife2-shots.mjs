/** 刀2 截图：toast / 角标 / 空态 / 影响列表。viewport 1440×900。 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const base = process.env.SETTING_URL || "http://127.0.0.1:8787";
const outDir = path.resolve(import.meta.dirname, "../../docs/plans/assets/knife2");
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(25000);

const book = "k2-shot-" + Date.now();
await page.goto(base + "/");
await page.getByTestId("book-name").fill(book);
await page.getByTestId("create-book").click();
await page.getByTestId("book-label").waitFor();
await page.getByTestId("sit-world").waitFor();
await page.screenshot({ path: path.join(outDir, "k2-01-empty-ledgers.png") });

await page.getByTestId("intent").fill("把信交出去");
await page.getByTestId("write-next").click();
await page.locator(".card.draft").first().waitFor();
await page.getByTestId("undo-toast").waitFor();
await page.screenshot({ path: path.join(outDir, "k2-02-insert-toast.png") });

await page.getByTestId("fill-fake").click({ force: true });
const badge = page.getByTestId("model-suggest-badge");
await badge.waitFor();
await badge.scrollIntoViewIfNeeded();
await page.screenshot({ path: path.join(outDir, "k2-03-model-badge.png") });

await page.getByTestId("write-box").click();
await page.getByTestId("do-text").waitFor();
await page.getByTestId("model-suggest-badge").scrollIntoViewIfNeeded();
await page.screenshot({ path: path.join(outDir, "k2-06-unwritten-shift.png") });
await page.getByTestId("do-text").fill("交信。");
await page.getByTestId("commit").click();
await page.locator(".card.canon").first().waitFor({ timeout: 15000 });
await page.screenshot({ path: path.join(outDir, "k2-04-commit-toast.png") });

await page.locator(".card.canon").first().click();
const seq = page.getByTestId("commit-seq");
await seq.waitFor();
await seq.scrollIntoViewIfNeeded();
await page.screenshot({ path: path.join(outDir, "k2-05-commit-seq.png") });

await page.getByTestId("density-mid").click();
const st = await page.evaluate(async () => (await (await fetch("/api/state")).json()));
const b1 = (st.committed || []).find((b) => (b.intent || "").includes("把信交出去"));
await page.getByTestId("intent").fill("因为交信船要开");
await page.getByTestId("write-next").click();
await page.locator(".card.draft").first().click();
await page.getByTestId("cause-beat").fill(b1.id);
await page.getByTestId("do-text").fill("号子。");
await page.getByTestId("commit").click();
await page.waitForFunction(async () => ((await (await fetch("/api/state")).json()).committed || []).length >= 2, null, { timeout: 20000 });
await page.getByTestId("tooth-0").click();
await page.locator(`[data-testid="card-${b1.id}"]`).click();
await page.getByTestId("delete-canon").click();
await page.getByTestId("impact-list").waitFor();
await page.screenshot({ path: path.join(outDir, "k2-07-delete-canon-impacts.png") });
await page.getByTestId("confirm-cancel").click();

await page.getByTestId("open-shelf").click();
await page.getByTestId("shelf").waitFor();
const delBtn = page.getByTestId(`shelf-del-${book}`);
await delBtn.evaluate((el) => {
  const details = el.closest("details");
  if (details) details.open = true;
});
await delBtn.click();
await page.getByTestId("del-book-impacts").waitFor();
await page.screenshot({ path: path.join(outDir, "k2-08-del-book-impacts.png") });

await browser.close();
console.log("shots", outDir);
