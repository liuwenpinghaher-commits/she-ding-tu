import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nextTheme, resolveTheme, THEME_KEY } from "./theme.ts";

describe("resolveTheme", () => {
  it("地址栏优先于本地记忆", () => {
    assert.equal(resolveTheme("?theme=light", "dark"), "light");
    assert.equal(resolveTheme("theme=dark", "light"), "dark");
  });

  it("没有地址栏时用本地记忆，默认亮色", () => {
    assert.equal(resolveTheme("", "dark"), "dark");
    assert.equal(resolveTheme("", null), "light");
    assert.equal(resolveTheme("", "nope"), "light");
  });

  it("新键没有时回落旧演示页的记忆", () => {
    assert.equal(resolveTheme("", null, "light"), "light");
    assert.equal(resolveTheme("", "dark", "light"), "dark");
  });
});

describe("nextTheme", () => {
  it("亮暗对切", () => {
    assert.equal(nextTheme("dark"), "light");
    assert.equal(nextTheme("light"), "dark");
  });
});

describe("THEME_KEY", () => {
  it("存在本产品自己的记忆键", () => {
    assert.equal(THEME_KEY, "setting-theme");
  });
});
