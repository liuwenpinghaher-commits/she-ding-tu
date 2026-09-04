import { expect, type Page } from "@playwright/test";
import { openTimeline, test, writeDraftBar, waitBookLabel } from "./helpers";

test.describe.configure({ timeout: 120000 });

async function boot(page: Page, book: string) {
  await page.goto("/");
  await page.getByTestId("book-name").fill(book);
  await page.getByTestId("create-book").click();
  await waitBookLabel(page, book);
  await openTimeline(page);
}

async function writeDraft(page: Page, intent: string) {
  return writeDraftBar(page, intent);
}

test("条目色是同规格色块", async ({ page }) => {
  const book = "ui-swatch-" + Date.now();
  await boot(page, book);
  await writeDraft(page, "一场");
  await page.locator(".tl-bar.draft").first().click();
  await expect(page.getByTestId("item-colors")).toBeVisible();
  const sizes = await page.getByTestId("item-colors").evaluate((el) => {
    const nodes = [...el.querySelectorAll<HTMLElement>(".swatch, input[type=color]")];
    return nodes.map((n) => ({ w: Math.round(n.getBoundingClientRect().width), h: Math.round(n.getBoundingClientRect().height) }));
  });
  expect(sizes.length).toBeGreaterThan(1);
  const first = sizes[0];
  expect(first.w).toBe(first.h);
  for (const s of sizes) {
    expect(s.w).toBe(first.w);
    expect(s.h).toBe(first.h);
  }
});

test("悬浮菜单在下方放不下时向上翻", async ({ page }) => {
  const book = "ui-flip-" + Date.now();
  await boot(page, book);
  await writeDraft(page, "一场");
  const bar = page.locator(".tl-bar.draft").first();
  const id = await bar.getAttribute("data-tl-id");
  expect(id).toBeTruthy();
  await bar.evaluate((el) => {
    const real = el.getBoundingClientRect.bind(el);
    el.getBoundingClientRect = () => {
      const r = real();
      return new DOMRect(r.x, window.innerHeight - 36, r.width, r.height);
    };
  });
  await bar.hover();
  await expect(page.getByTestId("tl-tools-" + id)).toHaveAttribute("data-flip", "up");
  await expect(page.getByTestId("tl-copy-" + id)).toBeVisible();
});

test("主题开关是图标不是暗色二字", async ({ page }) => {
  await page.goto("/");
  const btn = page.getByTestId("theme-toggle");
  await expect(btn).toHaveAttribute("aria-label", "切到暗色主题");
  await expect(btn.getByTestId("theme-icon")).toBeVisible();
  await expect(btn).not.toHaveText(/暗色|亮色/);
  await btn.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(btn).toHaveAttribute("aria-label", "切到亮色主题");
  await expect(btn.getByTestId("theme-icon")).toBeVisible();
});
