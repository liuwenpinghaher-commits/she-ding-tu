import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addCustomColor, isLocked, itemColor, nestParent, setConstraint, setItemColor, setNest, toggleLock, loadConstraints } from "./localPrefs.ts";

describe("本书本地偏好", () => {
  it("日期锁定按场记住", () => {
    const book = "lock-test-" + Date.now();
    assert.equal(isLocked(book, "a"), false);
    assert.equal(toggleLock(book, "a"), true);
    assert.equal(isLocked(book, "a"), true);
    assert.equal(toggleLock(book, "a"), false);
  });

  it("嵌套记住父场", () => {
    const book = "nest-test-" + Date.now();
    setNest(book, "child", "parent");
    assert.equal(nestParent(book, "child"), "parent");
    setNest(book, "child", null);
    assert.equal(nestParent(book, "child"), null);
  });

  it("条目色和自定义色按书记住", () => {
    const book = "color-test-" + Date.now();
    assert.equal(itemColor(book, "a"), null);
    setItemColor(book, "a", "#DF627A");
    assert.equal(itemColor(book, "a"), "#DF627A");
    const extra = addCustomColor(book, "#123456");
    assert.ok(extra.includes("#123456"));
  });

  it("场与场之间的间隔约束按书记住", () => {
    const book = "gap-test-" + Date.now();
    setConstraint(book, "wed", "ask", 1440);
    const rows = loadConstraints(book);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].gap, 1440);
    setConstraint(book, "wed", null, 0);
    assert.equal(loadConstraints(book).length, 0);
  });
});
