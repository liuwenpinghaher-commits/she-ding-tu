import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { N_MAX, clampN, readableColMax } from "./window.ts";

describe("分场条本页列数", () => {
  it("窄窗按标题还能读来钳，至少 1", () => {
    assert.equal(readableColMax(200), 1);
    assert.equal(readableColMax(0), N_MAX);
  });

  it("约 660 宽的中栏还能排 6 列", () => {
    assert.equal(readableColMax(660), 6);
  });

  it("更宽的窗仍钳在 6 列", () => {
    assert.equal(readableColMax(1600), 6);
    assert.equal(readableColMax(2400), N_MAX);
  });

  it("clamp 用当前窗的上限，且不超过 6", () => {
    assert.equal(clampN(9, 8), 6);
    assert.equal(clampN(0, 8), 1);
    assert.equal(clampN(7), 6);
  });
});
