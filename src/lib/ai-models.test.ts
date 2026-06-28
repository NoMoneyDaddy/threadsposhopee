import { test } from "node:test";
import assert from "node:assert/strict";
import { GEMINI_MODELS, DEFAULT_GEMINI_MODEL, isAllowedGeminiModel, geminiModelInfo, estimatedPostsPerDay, normalizeModelInput } from "./ai-models";

test("normalizeModelInput：null/空字串=清除；白名單字串=設定；缺/型別錯誤/非白名單=非法(undefined)", () => {
  assert.equal(normalizeModelInput(null), null); // 明確清除
  assert.equal(normalizeModelInput(""), null);
  assert.equal(normalizeModelInput("   "), null); // 純空白＝清除
  assert.equal(normalizeModelInput("gemini-2.5-pro"), "gemini-2.5-pro");
  assert.equal(normalizeModelInput(undefined), undefined); // 缺欄位 → 非法（不可誤清）
  assert.equal(normalizeModelInput(123), undefined); // 型別錯誤
  assert.equal(normalizeModelInput("gpt-4o"), undefined); // 非白名單
});

test("isAllowedGeminiModel：只放行白名單內的模型 id", () => {
  assert.equal(isAllowedGeminiModel("gemini-2.5-flash-lite"), true);
  assert.equal(isAllowedGeminiModel("gemini-2.5-flash"), true);
  assert.equal(isAllowedGeminiModel("gpt-4o"), false); // 非 Gemini
  assert.equal(isAllowedGeminiModel("../../etc/passwd"), false); // 任意字串
  assert.equal(isAllowedGeminiModel(null), false);
  assert.equal(isAllowedGeminiModel(123), false);
});

test("預設模型在白名單內", () => {
  assert.equal(isAllowedGeminiModel(DEFAULT_GEMINI_MODEL), true);
  assert.ok(geminiModelInfo(DEFAULT_GEMINI_MODEL));
});

test("estimatedPostsPerDay：每篇 1 次呼叫＝約等於 RPD；異常值回 0", () => {
  assert.equal(estimatedPostsPerDay(1000), 1000);
  assert.equal(estimatedPostsPerDay(250, 1), 250);
  assert.equal(estimatedPostsPerDay(100, 2), 50); // 每篇 2 次呼叫
  assert.equal(estimatedPostsPerDay(0), 0);
  assert.equal(estimatedPostsPerDay(-5), 0);
  // callsPerPost 為 NaN/Infinity 也要回 0（不可變 NaN）
  assert.equal(estimatedPostsPerDay(100, Number.NaN), 0);
  assert.equal(estimatedPostsPerDay(100, Number.POSITIVE_INFINITY), 0);
});

test("GEMINI_MODELS：由便宜到貴（免費額度遞減），且預設為最省那個", () => {
  assert.equal(GEMINI_MODELS[0].id, DEFAULT_GEMINI_MODEL);
  for (let i = 1; i < GEMINI_MODELS.length; i++) {
    assert.ok(GEMINI_MODELS[i].freeRpd <= GEMINI_MODELS[i - 1].freeRpd);
  }
});
