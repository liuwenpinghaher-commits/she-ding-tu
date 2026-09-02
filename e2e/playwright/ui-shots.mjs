/** 成品截图：书架、时间轴、分场条、检查器、暗色。viewport 1440×900。 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const base = process.env.SETTING_URL || "http://127.0.0.1:8787";
const outDir = process.env.UI_SHOT_DIR || path.resolve("e2e/evidence/ui-redesign");
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(20000);

async function openTab(kind) {
  const id = kind === "时间轴" ? "open-timeline" : `tab-${kind}`;
  const tab = page.getByTestId(id);
  if (await tab.count()) {
    await tab.first().click();
    return;
  }
  await page.getByTestId("tab-add").locator("summary").click();
  await page.getByTestId(`tab-add-${kind}`).click();
}

await page.goto(base + "/");
await page.getByTestId("open-shelf").click();
await page.getByTestId("shelf").waitFor();
await page.screenshot({ path: path.join(outDir, "01-shelf.png") });

await page.getByTestId("book-name").fill("渡口");
await page.getByTestId("open-book").click();
await page.getByTestId("book-label").waitFor();
await openTab("时间轴");
await page.getByTestId("timeline").waitFor();
const bar = page.locator(".tl-bar").first();
await bar.waitFor();
await bar.click();
await page.getByTestId("scene-clock").waitFor();
await page.screenshot({ path: path.join(outDir, "02-timeline.png") });

await page.screenshot({ path: path.join(outDir, "04-inspector.png") });

await openTab("分场条");
await page.getByTestId("stripboard").waitFor();
await page.screenshot({ path: path.join(outDir, "03-stripboard.png") });

await openTab("总表");
await page.getByTestId("table-view").waitFor();
await page.screenshot({ path: path.join(outDir, "06-table.png") });

await openTab("关系");
await page.getByTestId("look-relations-panel").waitFor();
await page.screenshot({ path: path.join(outDir, "07-relation.png") });

await openTab("轨迹");
await page.getByTestId("look-track").waitFor();
await page.screenshot({ path: path.join(outDir, "08-subway.png") });

await openTab("讲述序");
await page.getByTestId("narrative-view").waitFor();
await page.screenshot({ path: path.join(outDir, "09-narrative.png") });

await openTab("白板");
await page.getByTestId("whiteboard").waitFor();
await page.screenshot({ path: path.join(outDir, "10-whiteboard.png") });

await openTab("时间轴");
await page.getByTestId("theme-toggle").click();
await page.waitForTimeout(200);
await page.screenshot({ path: path.join(outDir, "05-dark.png") });
await page.getByTestId("theme-toggle").click();

await browser.close();
console.log("shots", outDir);
