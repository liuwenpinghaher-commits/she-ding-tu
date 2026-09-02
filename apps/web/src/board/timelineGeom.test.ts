import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  barRect,
  clockDiffs,
  clockToX,
  defaultViewport,
  depSatisfied,
  followMovedCount,
  intervalLabel,
  packRows,
  minutesFromDrag,
  pan,
  pxForScale,
  resizeSpan,
  resolveDependencyClocks,
  shiftSpan,
  snapClock,
  viewportFromTo,
  xToClock,
  zoom,
} from "./timelineGeom.ts";

describe("时间轴几何", () => {
  it("钟换成横坐标，再换回来", () => {
    const vp = { origin: 0, pxPerMinute: 2, width: 800 };
    assert.equal(clockToX(30, vp), 60);
    assert.equal(xToClock(60, vp), 30);
  });

  it("高缩放拖几像素也至少改一分钟", () => {
    assert.equal(minutesFromDrag(80, 16), 5);
    assert.equal(minutesFromDrag(80, 11.5), 7);
    assert.equal(minutesFromDrag(3, 16), 0);
    assert.equal(minutesFromDrag(8, 16), 1);
    assert.equal(minutesFromDrag(-8, 16), -1);
  });

  it("条的宽度跟时长成正比", () => {
    const vp = { origin: 0, pxPerMinute: 1, width: 1000 };
    const a = barRect(0, 60, vp);
    const b = barRect(0, 120, vp);
    assert.equal(a.width * 2, b.width);
    assert.ok(b.left === a.left);
  });

  it("缩放以指针下的钟为中心", () => {
    const vp = { origin: 0, pxPerMinute: 1, width: 800 };
    const next = zoom(vp, 2, 100);
    assert.equal(xToClock(100, next), 100);
    assert.equal(next.pxPerMinute, 2);
  });

  it("平移不改尺度，只改窗口起点", () => {
    const vp = { origin: 0, pxPerMinute: 2, width: 800 };
    const next = pan(vp, 40);
    assert.equal(next.pxPerMinute, 2);
    assert.equal(next.origin, -20);
  });

  it("拖条左右改钟，时长不变", () => {
    assert.deepEqual(shiftSpan(100, 160, 30), { from: 130, to: 190 });
    assert.deepEqual(shiftSpan(10, 40, -100), { from: 0, to: 30 });
  });

  it("拖边改开始或结束，时长至少 1 分", () => {
    assert.deepEqual(resizeSpan(100, 200, "from", 150), { from: 150, to: 200 });
    assert.deepEqual(resizeSpan(100, 200, "to", 250), { from: 100, to: 250 });
    assert.deepEqual(resizeSpan(100, 200, "to", 50), { from: 100, to: 101 });
  });

  it("两场间隔说人话", () => {
    assert.equal(intervalLabel(0, 30), "隔了30分钟");
    assert.equal(intervalLabel(0, 120), "隔了2个时辰");
    assert.equal(intervalLabel(0, 1440), "隔了1天");
  });

  it("默认窗口包住全书并留边", () => {
    const vp = defaultViewport(0, 300, 900);
    assert.ok(vp.origin < 0);
    assert.ok(clockToX(0, vp) > 0);
    assert.ok(clockToX(300, vp) < 900);
  });

  it("按尺度吸附钟", () => {
    assert.equal(snapClock(67, 60), 60);
    assert.equal(snapClock(89, 60), 60);
    assert.equal(snapClock(91, 60), 120);
  });

  it("年尺度比日尺度稀", () => {
    assert.ok(pxForScale("year") < pxForScale("day"));
    assert.ok(pxForScale("day") < pxForScale("hour"));
  });

  it("From–To 铺满宽度", () => {
    const vp = viewportFromTo(0, 1440, 800);
    assert.ok(vp.pxPerMinute > 0);
    assert.ok(vp.origin <= 0);
  });

  it("跟着动的场是开始不早于这场结束的", () => {
    const all = [
      { id: "a", clock_from: 0, clock_to: 60 },
      { id: "b", clock_from: 60, clock_to: 120 },
      { id: "c", clock_from: 30, clock_to: 50 },
    ];
    assert.equal(followMovedCount(all, { id: "a", clock_to: 60 }), 1);
    assert.equal(depSatisfied(60, 60), true);
    assert.equal(depSatisfied(60, 50), false);
  });

  it("按依赖把后面的场推到上场结束之后", () => {
    const scenes = [
      { id: "a", clock_from: 0, clock_to: 60 },
      { id: "b", clock_from: 10, clock_to: 40, cause_beat: "a" },
    ];
    const next = resolveDependencyClocks(scenes);
    const b = next.find((s) => s.id === "b");
    assert.equal(b?.clock_from, 60);
    assert.equal(b?.clock_to, 90);
    assert.equal(clockDiffs(scenes, next).length, 1);
  });

  it("约束「隔一天」把后一场推到上场结束再加间隔", () => {
    const scenes = [
      { id: "ask", clock_from: 0, clock_to: 60 },
      { id: "wed", clock_from: 70, clock_to: 130 },
    ];
    const next = resolveDependencyClocks(scenes, [{ laterId: "wed", earlierId: "ask", gap: 1440 }]);
    const wed = next.find((s) => s.id === "wed");
    assert.equal(wed?.clock_from, 1500);
    assert.equal(wed?.clock_to, 1560);
  });

  it("重叠的场错开到下一行", () => {
    const rows = packRows([
      { id: "a", clock_from: 0, clock_to: 60 },
      { id: "b", clock_from: 30, clock_to: 90 },
      { id: "c", clock_from: 60, clock_to: 80 },
    ]);
    assert.equal(rows.get("a"), 0);
    assert.equal(rows.get("b"), 1);
    assert.equal(rows.get("c"), 0);
  });
});
