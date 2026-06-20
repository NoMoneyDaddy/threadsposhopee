import { defineConfig, devices } from "@playwright/test";

// E2E 跑在 Demo 模式（不設 Supabase 金鑰 → 走 src/fixtures，免登入）。
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry"
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // 無金鑰 → Demo 模式；用 dev server 啟動最省事
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { NODE_ENV: "development" }
  }
});
