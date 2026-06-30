import { test } from "node:test";
import assert from "node:assert/strict";
import { GEMINI_MODELS, DEFAULT_GEMINI_MODEL, FREE_TIER_RANK, isAllowedGeminiModel, geminiModelInfo, normalizeModelInput } from "./ai-models";

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

test("GEMINI_MODELS：免費額度由多到少（高→低），預設為最省那個，且不寫死具體次數", () => {
  assert.equal(GEMINI_MODELS[0].id, DEFAULT_GEMINI_MODEL);
  for (let i = 1; i < GEMINI_MODELS.length; i++) {
    assert.ok(FREE_TIER_RANK[GEMINI_MODELS[i].freeTier] <= FREE_TIER_RANK[GEMINI_MODELS[i - 1].freeTier]);
  }
  // 避免回頭塞具體每日次數（會隨 Google 政策過時、誤導使用者選到低額度模型）
  for (const m of GEMINI_MODELS) assert.equal(typeof (m as unknown as Record<string, unknown>).freeRpd, "undefined");
});
