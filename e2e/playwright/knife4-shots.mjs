/** 刀4 截图：G0/G2/G4/G7 等引导气泡。viewport 1440×900。 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const base = process.env.SETTING_URL || "http://127.0.0.1:8787";
const outDir = path.resolve(import.meta.dirname, "../../docs/plans/assets/knife4");
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(25000);
await page.addInitScript(() => { try { localStorage.removeItem("sdt-guide-v1"); } catch { /* ignore */ } });

await page.goto(base + "/");
await page.getByTestId("guide-start").click();
await page.getByTestId("guide-bubble").waitFor();
await page.screenshot({ path: path.join(outDir, "k4-01-g0-shelf.png") });

await page.getByTestId("guide-next").click();
await page.getByTestId("guide-step").waitFor();
await page.screenshot({ path: path.join(outDir, "k4-02-g1-corner.png") });

await page.getByTestId("shelf-new").click();
await page.getByTestId("nb-name").waitFor();
await page.getByTestId("guide-bubble").waitFor();
await page.screenshot({ path: path.join(outDir, "k4-03-g1-newbook.png") });

const book = "k4-shot-" + Date.now();
await page.getByTestId("nb-name").fill(book);
await page.getByTestId("nb-create").click();
await page.getByTestId("stripboard").waitFor();
await page.getByTestId("guide-bubble").waitFor();
await page.screenshot({ path: path.join(outDir, "k4-04-g2-board.png") });

await page.getByTestId("guide-next").click();
await page.screenshot({ path: path.join(outDir, "k4-05-g3-rail.png") });

await page.getByTestId("guide-next").click();
await page.getByTestId("guide-bubble").waitFor();
await page.screenshot({ path: path.join(outDir, "k4-06-g4-intent.png") });

await page.getByTestId("guide-next").click();
await page.screenshot({ path: path.join(outDir, "k4-07-g5-write-next.png") });

await page.getByTestId("guide-next").click();
await page.getByTestId("guide-next").click();
await page.screenshot({ path: path.join(outDir, "k4-08-g7-do.png") });

await browser.close();
console.log("shots", outDir);
