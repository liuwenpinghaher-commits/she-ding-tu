/** 刀3 截图：账本人话 / 卡标题 / 填场按钮 / 写入正史解释 / 未贴线。viewport 1440×900。 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const base = process.env.SETTING_URL || "http://127.0.0.1:8787";
const outDir = path.resolve(import.meta.dirname, "../../docs/plans/assets/knife3");
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(25000);

const book = "k3-shot-" + Date.now();
await page.goto(base + "/");
await page.getByTestId("book-name").fill(book);
await page.getByTestId("create-book").click();
await page.getByTestId("book-label").waitFor();
await page.getByTestId("sit-blocks").waitFor();
await page.getByTestId("sit-blocks").scrollIntoViewIfNeeded();
await page.screenshot({ path: path.join(outDir, "k3-05-after-ledgers.png") });

await page.getByTestId("intent").fill("把信交出去");
await page.getByTestId("write-next").click();
await page.locator(".card.draft").first().waitFor();
await page.screenshot({ path: path.join(outDir, "k3-06-after-card-title.png") });

await page.locator(".card.draft").first().click();
await page.getByTestId("commit-explain").scrollIntoViewIfNeeded();
await page.screenshot({ path: path.join(outDir, "k3-07-after-commit-explain.png") });

await page.getByTestId("fill-fake").click({ force: true });
await page.getByTestId("write-box").waitFor();
await page.getByTestId("write-box").scrollIntoViewIfNeeded();
await page.screenshot({ path: path.join(outDir, "k3-08-after-write-box.png") });

await page.getByTestId("thread-unlined").scrollIntoViewIfNeeded();
await page.screenshot({ path: path.join(outDir, "k3-09-after-unlined.png") });

await page.getByTestId("density-sparse").scrollIntoViewIfNeeded();
await page.screenshot({ path: path.join(outDir, "k3-10-after-density.png") });

await browser.close();
console.log("shots", outDir);
