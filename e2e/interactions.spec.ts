import { test, expect } from "@playwright/test";

test("草稿：狀態分頁與關鍵字篩選", async ({ page }) => {
  await page.goto("/drafts");
  await expect(page.getByRole("heading", { name: "草稿", level: 1 })).toBeVisible();

  // 狀態分頁存在（避免與 BulkBar 的「全部核准」等按鈕衝突，用「全部 N」計數樣式定位）
  await expect(page.getByRole("button", { name: /^全部 \d/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^已發布/ })).toBeVisible();

  // 搜尋不存在的關鍵字 → 顯示空狀態
  const search = page.getByPlaceholder("搜尋商品名／正文／連結");
  await expect(search).toBeVisible();
  await search.fill("zzz_不存在的關鍵字_zzz");
  await expect(page.getByText("沒有符合條件的草稿。")).toBeVisible();
});

test("發文：表單欄位可見", async ({ page }) => {
  await page.goto("/compose");
  await expect(page.getByRole("heading", { name: "發文", level: 1 })).toBeVisible();
  // 至少有一個文字輸入區（正文）
  await expect(page.locator("textarea").first()).toBeVisible();
});

test("成效：每日發布量區塊渲染", async ({ page }) => {
  await page.goto("/insights");
  await expect(page.getByRole("heading", { name: "成效", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "每日發布量" })).toBeVisible();
});

test("帳號管理：頁面與表單載入", async ({ page }) => {
  await page.goto("/accounts");
  await expect(page.getByRole("heading", { name: "帳號管理", level: 1 })).toBeVisible();
});
