import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GUIDE_MAIN, GUIDE_STEPS, loadGuide, nextGuide, prevGuide, saveGuide, skipGuide, startGuide } from "./guide.ts";

describe("引导主线", () => {
  it("主线是 G0–G9，G10/G11 占位可续加", () => {
    assert.deepEqual(GUIDE_MAIN.map((s) => s.id), ["G0", "G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8", "G9"]);
    assert.equal(GUIDE_STEPS.some((s) => s.id === "G10" && s.main === false), true);
    assert.equal(GUIDE_STEPS.some((s) => s.id === "G11" && s.main === false), true);
    assert.ok(GUIDE_MAIN[0].bubble.includes("这是你的书单"));
    assert.ok(GUIDE_MAIN[2].bubble.includes("中间是这场戏的桌子"));
    assert.ok(GUIDE_MAIN[4].bubble.includes("这场要办成什么"));
  });

  it("开始、下一步、上一步、跳过", () => {
    saveGuide({ status: "idle", index: 0 });
    startGuide();
    assert.equal(loadGuide().status, "running");
    assert.equal(loadGuide().index, 0);
    nextGuide();
    assert.equal(loadGuide().index, 1);
    prevGuide();
    assert.equal(loadGuide().index, 0);
    skipGuide();
    assert.equal(loadGuide().status, "skipped");
    startGuide();
    assert.equal(loadGuide().status, "running");
    assert.equal(loadGuide().index, 0);
  });
});
