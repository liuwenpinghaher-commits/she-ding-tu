import { test as base, type Page } from "@playwright/test";

/** 关掉确认变更浮层并取消服务端未确认结构改动，避免上一测泄漏挡住创建书。reload 后要看见确认变更时不要走这条。 */
export async function dismissPending(page: Page) {
  await page.evaluate(async () => {
    const d = document.getElementById("confirm-dlg") as HTMLDialogElement | null;
    if (d?.open) d.close();
    try {
      await fetch("/api/structure/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
    } catch {
      /* 服务未开或未开书时忽略 */
    }
  });
}

export const test = base.extend({
  page: async ({ page }, use) => {
    const origGoto = page.goto.bind(page);
    page.goto = (async (url, options) => {
      const res = await origGoto(url, options);
      await dismissPending(page);
      return res;
    }) as typeof page.goto;
    await use(page);
    await dismissPending(page).catch(() => {});
  },
});
