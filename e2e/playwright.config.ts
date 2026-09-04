import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./playwright",
  timeout: 90000,
  fullyParallel: false,
  workers: 1,
  use: { baseURL: process.env.SETTING_URL || "http://127.0.0.1:8787", headless: true },
});
