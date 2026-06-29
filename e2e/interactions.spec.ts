import { test, expect } from "@playwright/test";

test("工作台：看板欄位渲染", async ({ page }) => {
  await page.goto("/pipeline");
  await expect(page.getByRole("heading", { name: "工作台", level: 1 })).toBeVisible();
  // 流水線欄位標題（草稿／已發布）可見（h2，含 emoji 前綴，用部分比對）
  await expect(page.getByRole("heading", { name: /草稿/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /已發布/ })).toBeVisible();
});

test("工作台：新貼文表單可展開", async ({ page }) => {
  await page.goto("/pipeline");
  // 「＋ 新貼文」展開共用編輯器（含正文 textarea）
  await page.getByRole("button", { name: /新貼文/ }).click();
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
