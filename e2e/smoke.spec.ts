import { test, expect } from "@playwright/test";

// Demo 模式下每個主要頁面都應該 server-render 出標題，且不噴 console error。
const PAGES: { path: string; heading: string }[] = [
  { path: "/", heading: "儀表板" },
  { path: "/pipeline", heading: "工作台" }, // 發文/素材/草稿三頁已整併進工作台單頁看板
  { path: "/sources", heading: "抓文生素材" },
  { path: "/insights", heading: "成效分析" },
  { path: "/accounts", heading: "帳號管理" }
];

test("首頁顯示 Demo 模式標記與導覽", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Demo 模式（未連接金鑰）")).toBeVisible();
  // 導覽列含六大頁主要連結（「工作台」整併發文/草稿/AI代理人/素材/自動抓文）
  await expect(page.getByRole("link", { name: "工作台", exact: true })).toBeVisible();
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

test("導覽列「工作台」可切換到工作台頁", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "工作台", exact: true }).click();
  await expect(page).toHaveURL(/\/pipeline$/);
  await expect(page.getByRole("heading", { name: "工作台", level: 1 })).toBeVisible();
});

test("情景：首頁「去工作台發文」CTA 直達工作台（減少來回）", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /去工作台/ }).click();
  await expect(page).toHaveURL(/\/pipeline$/);
});

test("情景：工作台次導覽可一鍵進「行事曆」", async ({ page }) => {
  await page.goto("/pipeline");
  await page.getByRole("link", { name: "行事曆", exact: true }).click();
  await expect(page).toHaveURL(/\/calendar$/);
});

test("情景：帳號管理含發文帳號綁定錨點（就地深連結可達）", async ({ page }) => {
  await page.goto("/accounts");
  await expect(page.locator("#setup-threads")).toHaveCount(1);
});
