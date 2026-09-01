import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ageAtClock, lifespanRange, parseBornClock } from "./ages.ts";

describe("这场他多大", () => {
  it("认分钟整数和「第 N 天」", () => {
    assert.equal(parseBornClock("0"), 0);
    assert.equal(parseBornClock("1440"), 1440);
    assert.equal(parseBornClock("第 3 天"), 2880);
    assert.equal(parseBornClock(""), null);
    assert.equal(parseBornClock("不明"), null);
  });

  it("用故事时差说人话，不算进算出这一刻", () => {
    assert.equal(ageAtClock(30, 0), "30分钟大");
    assert.equal(ageAtClock(1440, 0), "1天大");
    assert.equal(ageAtClock(365 * 1440, 0), "1岁");
    assert.equal(ageAtClock(10, 100), "还未出生");
  });

  it("寿命条两端可缺", () => {
    assert.deepEqual(lifespanRange(0, 10000, -10, 20000), { from: 0, to: 10000 });
    assert.deepEqual(lifespanRange(null, 100, 0, 500), { from: 0, to: 100 });
    assert.equal(lifespanRange(null, null, 0, 500), null);
  });
});
