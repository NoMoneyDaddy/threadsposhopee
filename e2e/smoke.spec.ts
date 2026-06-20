import { test, expect } from "@playwright/test";

// Demo 模式下每個主要頁面都應該 server-render 出標題，且不噴 console error。
const PAGES: { path: string; heading: string }[] = [
  { path: "/", heading: "儀表板" },
  { path: "/compose", heading: "快速發文" },
  { path: "/sources", heading: "監看來源" },
  { path: "/materials", heading: "素材庫" },
  { path: "/drafts", heading: "文案佇列" },
  { path: "/calendar", heading: "排程總覽" },
  { path: "/insights", heading: "成效統計" },
  { path: "/accounts", heading: "帳號管理" }
];

test("首頁顯示 Demo 模式標記與導覽", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Demo 模式（未連接金鑰）")).toBeVisible();
  // 導覽列含主要連結
  await expect(page.getByRole("link", { name: "素材庫" })).toBeVisible();
  await expect(page.getByRole("link", { name: "成效統計" })).toBeVisible();
});

for (const p of PAGES) {
  test(`頁面載入：${p.path}（${p.heading}）`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const res = await page.goto(p.path, { waitUntil: "domcontentloaded" });
    expect(res?.status(), `HTTP 狀態 ${p.path}`).toBeLessThan(400);
    await expect(page.getByRole("heading", { name: p.heading, level: 1 })).toBeVisible();
    expect(errors, `頁面 JS 例外 ${p.path}`).toEqual([]);
  });
}

test("導覽列點擊可切換到素材庫", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "素材庫" }).click();
  await expect(page).toHaveURL(/\/materials$/);
  await expect(page.getByRole("heading", { name: "素材庫", level: 1 })).toBeVisible();
});
