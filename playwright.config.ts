import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

// 沙箱/本機若 @playwright/test 版本比預裝瀏覽器新（自帶下載被停用），改用預裝的 chromium 執行。
// 以「該檔是否存在」為閘門即可：GitHub CI 走自帶瀏覽器路徑（此路徑不存在 → 不覆寫）；
// 本沙箱預裝於 /opt/pw-browsers（存在 → 用它）。PW_EXECUTABLE_PATH 可手動指定。
const localChromium = process.env.PW_EXECUTABLE_PATH || "/opt/pw-browsers/chromium";
const executablePath = existsSync(localChromium) ? localChromium : undefined;

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
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], launchOptions: { executablePath } } }],
  webServer: {
    // 無金鑰 → Demo 模式；用 dev server 啟動最省事
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { NODE_ENV: "development" }
  }
});
