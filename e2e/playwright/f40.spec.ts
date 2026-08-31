/**
 * F40 作家总闭环 26 步。实现见 f40.click.mjs。
 * 禁止 page.request 写入正史。
 */
import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

test("F40 26 步作家总闭环", async ({}, testInfo) => {
  test.setTimeout(180000);
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(dir, "../..");
  const r = spawnSync(process.execPath, [path.join(dir, "f40.click.mjs")], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      SETTING_URL: String(testInfo.project.use.baseURL || process.env.SETTING_URL || "http://127.0.0.1:8787"),
      EVIDENCE_DIR: path.join(root, "e2e/evidence/6.1"),
    },
  });
  if (r.stdout) console.log(r.stdout);
  if (r.stderr) console.log(r.stderr);
  expect(r.status, r.stdout + r.stderr).toBe(0);
  expect(r.stdout || "").toContain("F40_CLICK_PASS");
});
