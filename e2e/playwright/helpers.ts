import { expect, test as base, type Page } from "@playwright/test";

/** 打开某一枚工作区页签。没有就从「+」再开。 */
export async function openWorkspaceTab(page: Page, kind: string) {
  await page.getByTestId("tab-bar").waitFor();
  const special = kind === "时间轴" ? page.getByTestId("open-timeline") : page.getByTestId(`tab-${kind}`);
  if (await special.count()) {
    await special.first().click();
    return;
  }
  const named = page.getByRole("button", { name: kind, exact: true });
  if (await named.count()) {
    await named.first().click();
    return;
  }
  const overflow = page.getByTestId("tab-overflow");
  if (await overflow.count()) {
    await overflow.locator("summary").click();
    if (await special.count()) {
      await special.first().click();
      return;
    }
    if (await named.count()) {
      await named.first().click();
      return;
    }
  }
  await page.getByTestId("tab-add").locator("summary").click();
  await page.getByTestId(`tab-add-${kind}`).click();
}

/** 切到分场条页签。写厚、列数、细条仍在这里。关掉了就从「+」再开一枚。 */
export async function openStripboard(page: Page) {
  await openWorkspaceTab(page, "分场条");
  await expect(page.getByTestId("stripboard")).toBeVisible();
}

/** 点开刚写下的草稿卡，右边栏才能填。拖人不代替点选。 */
export async function selectDraftCard(page: Page) {
  await openStripboard(page);
  const draft = page.locator(".card.draft").first();
  await draft.waitFor();
  await draft.click();
  await expect(page.getByTestId("commit")).toBeEnabled();
  await expect(page.getByTestId("do-text")).toBeEditable();
}

/** 关掉确认变更浮层并取消服务端未确认结构改动，避免上一测泄漏挡住创建书。reload 后要看见确认变更时不要走这条。 */
export async function dismissPending(page: Page) {
  if (page.isClosed()) return;
  await page.evaluate(async () => {
    document.querySelectorAll("dialog[open]").forEach((el) => {
      try { (el as HTMLDialogElement).close(); } catch { /* ignore */ }
    });
    const ae = document.activeElement as HTMLElement | null;
    if (ae && ae !== document.body && typeof ae.blur === "function") ae.blur();
    const openConfirm = document.querySelector<HTMLDialogElement>("dialog[open][data-testid=confirm-change]");
    if (openConfirm) openConfirm.querySelector<HTMLElement>("[data-testid=confirm-cancel]")?.click();
    for (const id of ["craft-close", "export-close", "paste-close"]) {
      const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
      if (el && el.offsetParent !== null) el.click();
    }
    const t = () => AbortSignal.timeout(3000);
    try {
      await fetch("/api/structure/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        signal: t(),
      });
    } catch {
      /* 服务未开或未开书时忽略 */
    }
    try {
      await fetch("/api/lens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ person: null }),
        signal: t(),
      });
    } catch {
      /* 无透镜接口或未开书时忽略 */
    }
  }).catch(() => {});
}

/** 热键撤销：先离开输入框，Control/Meta 都发，再派一次页面内按键；仍在就点撤销钮。 */
export async function pressUndo(page: Page) {
  const undoBtn = page.getByTestId("undo");
  await undoBtn.waitFor({ state: "visible", timeout: 5000 });
  const list = page.getByTestId("delta-list");
  await page.evaluate(() => {
    const ae = document.activeElement as HTMLElement | null;
    if (ae && typeof ae.blur === "function") ae.blur();
    const el = document.querySelector<HTMLElement>("[data-testid=delta-list]");
    if (el) {
      el.tabIndex = 0;
      el.focus();
    }
  });
  if (await list.count()) {
    await list.press("Control+z").catch(() => {});
    await list.press("Meta+z").catch(() => {});
    await list.press("ControlOrMeta+z").catch(() => {});
  } else {
    await page.keyboard.press("Control+z").catch(() => {});
    await page.keyboard.press("Meta+z").catch(() => {});
  }
  await page.evaluate(() => {
    const fire = (ctrl: boolean, meta: boolean) => {
      window.dispatchEvent(new KeyboardEvent("keydown", {
        key: "z",
        code: "KeyZ",
        ctrlKey: ctrl,
        metaKey: meta,
        bubbles: true,
        cancelable: true,
      }));
    };
    fire(true, false);
    fire(false, true);
  });
  try {
    await undoBtn.waitFor({ state: "hidden", timeout: 2000 });
  } catch {
    if (await undoBtn.isVisible().catch(() => false)) await undoBtn.click();
  }
}

export const test = base.extend({
  page: async ({ page }, use) => {
    const created: string[] = [];
    page.on("request", (req) => {
      if (req.method() !== "POST") return;
      let path = "";
      try { path = new URL(req.url()).pathname; } catch { return; }
      if (path !== "/api/books") return;
      try {
        const name = (req.postDataJSON() as { name?: string } | null)?.name;
        if (name && name !== "渡口") created.push(name);
      } catch { /* 无 JSON 体时忽略 */ }
    });
    const origGoto = page.goto.bind(page);
    page.goto = (async (url, options) => {
      const res = await origGoto(url, options);
      await dismissPending(page);
      return res;
    }) as typeof page.goto;
    await use(page);
    await page.keyboard.press("Escape").catch(() => {});
    await dismissPending(page).catch(() => {});
    if (!page.isClosed() && created.length) {
      await page.evaluate(async (names: string[]) => {
        for (const name of names) {
          if (!name || name === "渡口") continue;
          try {
            await fetch(`/api/books/${encodeURIComponent(name)}?confirm=${encodeURIComponent(name)}`, { method: "DELETE", signal: AbortSignal.timeout(5000) });
          } catch { /* 已删或没开服务 */ }
        }
      }, created).catch(() => {});
    }
  },
});
