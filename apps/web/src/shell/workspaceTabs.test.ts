import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_TAB, overflowTabs, readExtraLook, readTab, tabStorageKey, addTabInstance, closeTabInstance, defaultTabInstances } from "./workspaceTabs.ts";

describe("工作区页签", () => {
  it("新书默认时间轴", () => {
    assert.equal(DEFAULT_TAB, "时间轴");
    assert.equal(readTab("渡口", null, null), "时间轴");
  });

  it("地址栏 look 盖过这本书记住的页签", () => {
    assert.equal(readTab("渡口", "时间轴", "分场条"), "分场条");
  });

  it("没地址栏时用这本书上次的页签", () => {
    assert.equal(readTab("渡口", "讲述序", null), "讲述序");
  });

  it("不认识的值回落到时间轴", () => {
    assert.equal(readTab("渡口", "甘特", "foo"), "时间轴");
  });

  it("出场和进度从地址栏打开，但不替换记住的页签", () => {
    assert.equal(readTab("渡口", "时间轴", "出场"), "时间轴");
    assert.equal(readTab("渡口", "分场条", "进度"), "分场条");
    assert.equal(readExtraLook("出场"), "出场");
    assert.equal(readExtraLook("时间轴"), null);
  });

  it("记忆键按书分开", () => {
    assert.equal(tabStorageKey("渡口"), "setting-tab:渡口");
  });

  it("新书默认只有时间轴，可再加一枚带过滤的时间轴", () => {
    const start = defaultTabInstances();
    assert.equal(start.length, 1);
    assert.equal(start[0].kind, "时间轴");
    assert.equal(closeTabInstance(start, start[0].id).length, 1);
    const plus = addTabInstance(start, "时间轴", { who: "阿禾" });
    assert.equal(plus.length, 2);
    assert.equal(plus[1].kind, "时间轴");
    assert.notEqual(plus[1].id, "时间轴");
    assert.equal(plus[1].filter?.who, "阿禾");
    const board = addTabInstance(start, "分场条");
    assert.equal(board[1].id, "分场条");
  });

  it("挤不下进更多，当前枚仍可见", () => {
    const tabs = ["时间轴", "分场条", "总表", "关系", "轨迹", "列表", "讲述序", "白板"].map((kind) => ({
      id: kind,
      kind: kind as "时间轴",
      title: kind,
    }));
    const { shown, more } = overflowTabs(tabs, 3, "讲述序");
    assert.equal(shown.length, 3);
    assert.ok(shown.some((t) => t.id === "讲述序"));
    assert.equal(shown.length + more.length, tabs.length);
  });
});
