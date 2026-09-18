import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clipPlayable, desireLines, plantedPromiseIds, threeQuestionLines } from "./storyCard.ts";

describe("场景卡与规定情境人话", () => {
  it("渴望句在前用的材料", () => {
    assert.deepEqual(desireLines([{ name: "阿莲", profile: { desire: "过河" } }]), ["阿莲想要过河"]);
    assert.deepEqual(desireLines([{ name: "阿福", profile: { desire: "  " } }]), []);
  });
  it("导出到场和疏卡都截短", () => {
    assert.equal(clipPlayable("短"), "短");
    assert.equal(clipPlayable("一二三四五", 3), "一二三…");
  });
  it("未埋先兑：建议兑现视为零", () => {
    const planted = plantedPromiseIds([
      { promise_ops: [{ promise_id: "刀响", op: "plant" }] },
    ]);
    assert.equal(planted.has("刀响"), true);
    assert.equal(planted.has("铜牌"), false);
  });
  it("三问不把真值写进进场前信什么", () => {
    const people = [{ id: "阿莲", kind: "person", name: "阿莲" }];
    const q = threeQuestionLines({
      intent: "阿莲来找东西",
      desires: ["阿莲想要过河"],
      people,
      current: {
        id: "b2", draft: true, column_id: "c1", intent: "阿莲来找东西", kind: "scene",
        status: "draft", clock_from: 60, clock_to: 90, presences: [], story_threads: [],
      },
      scenes: [{
        id: "b1", draft: false, column_id: "c0", intent: "阿福发现刀", kind: "scene",
        status: "committed", clock_from: 0, clock_to: 30, presences: [], story_threads: [],
        knowledge_writes: [{ person_id: "阿莲", fact: "刀在厨房", certainty: "wrong", truth_value: "刀在抽屉" }],
      }],
    });
    assert.equal(q.want, "阿莲想要过河");
    assert.match(q.believe, /刀在厨房/);
    assert.doesNotMatch(q.believe, /刀在抽屉/);
    assert.match(q.from, /阿福发现刀/);
  });
});
