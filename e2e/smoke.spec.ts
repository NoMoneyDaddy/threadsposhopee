import { test, expect } from "@playwright/test";

// Demo 模式下每個主要頁面都應該 server-render 出標題，且不噴 console error。
const PAGES: { path: string; heading: string }[] = [
  { path: "/", heading: "儀表板" },
  { path: "/compose", heading: "發文" },
  { path: "/sources", heading: "自動抓文" },
  { path: "/materials", heading: "素材" },
  { path: "/drafts", heading: "草稿" },
  { path: "/insights", heading: "成效分析" },
  { path: "/accounts", heading: "帳號管理" }
];

test("首頁顯示 Demo 模式標記與導覽", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Demo 模式（未連接金鑰）")).toBeVisible();
  // 導覽列含六大頁主要連結（文章管理整併發文/草稿/AI代理人/素材/自動抓文）
  await expect(page.getByRole("link", { name: "文章管理", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "成效分析", exact: true })).toBeVisible();
});

test("行事曆頁顯示月曆檢視", async ({ page }) => {
  await page.goto("/calendar");
  await expect(page).toHaveURL(/\/calendar$/);
  await expect(page.getByRole("heading", { name: "內容行事曆", level: 1 })).toBeVisible();
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

test("導覽列「文章管理」可切換到草稿頁", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "文章管理", exact: true }).click();
  await expect(page).toHaveURL(/\/drafts$/);
  await expect(page.getByRole("heading", { name: "草稿", level: 1 })).toBeVisible();
});
