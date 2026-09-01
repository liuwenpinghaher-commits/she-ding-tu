import { expect, test as base, type Page } from "@playwright/test";

/** 点开刚写下的草稿卡，右边栏才能填。拖人不代替点选。 */
export async function selectDraftCard(page: Page) {
  const draft = page.locator(".card.draft").first();
  await draft.waitFor();
  await draft.click();
  await expect(page.getByTestId("commit")).toBeEnabled();
  await expect(page.getByTestId("do-text")).toBeEditable();
}

/** 关掉确认变更浮层并取消服务端未确认结构改动，避免上一测泄漏挡住创建书。reload 后要看见确认变更时不要走这条。 */
export async function dismissPending(page: Page) {
  await page.evaluate(async () => {
    document.querySelectorAll("dialog[open]").forEach((el) => {
      try { (el as HTMLDialogElement).close(); } catch { /* ignore */ }
    });
    const ae = document.activeElement as HTMLElement | null;
    if (ae && ae !== document.body && typeof ae.blur === "function") ae.blur();
    try {
      await fetch("/api/structure/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
    } catch {
      /* 服务未开或未开书时忽略 */
    }
    try {
      await fetch("/api/lens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ person: null }),
      });
    } catch {
      /* 无透镜接口或未开书时忽略 */
    }
  });
}

/** 热键撤销：先点出输入框，Meta 与 Control 都发一次（Linux 测机 Meta 有时不到）。 */
export async function pressUndo(page: Page) {
  const list = page.getByTestId("delta-list");
  if (await list.count()) await list.click();
  else {
    await page.evaluate(() => {
      const ae = document.activeElement as HTMLElement | null;
      if (ae && typeof ae.blur === "function") ae.blur();
    });
  }
  await page.keyboard.press("Meta+z");
  await page.keyboard.press("Control+z");
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
