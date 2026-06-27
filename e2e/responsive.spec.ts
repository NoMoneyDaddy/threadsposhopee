import { test, expect } from "@playwright/test";

// 響應式回歸：每頁 × 桌機/平板/手機，確保無水平溢出且無 JS 例外。
// （demo 假資料的外部圖在沙箱會有資源載入錯誤，與版面無關，故只看 pageerror。）
const PAGES = ["/", "/compose", "/sources", "/materials", "/drafts", "/calendar", "/insights", "/accounts", "/login", "/privacy", "/terms", "/sponsored"];

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 }
];

for (const vp of VIEWPORTS) {
  for (const path of PAGES) {
    test(`無水平溢出 ${vp.name} ${path}`, async ({ page }) => {
      const jsErrors: string[] = [];
      page.on("pageerror", (e) => jsErrors.push(e.message));
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const res = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(res?.status(), `HTTP ${path}`).toBeLessThan(400);
      await page.waitForTimeout(400);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow, `${path} @ ${vp.name} 水平溢出 ${overflow}px`).toBeLessThanOrEqual(2);
      expect(jsErrors, `${path} @ ${vp.name} JS 例外`).toEqual([]);
    });
  }
}
