import { test } from "node:test";
import assert from "node:assert/strict";
import { extractGeminiText, buildGenerationConfig, geminiErrorMessage } from "./gemini";

test("geminiErrorMessage：依錯誤類型給具體可行提示，否則回 fallback", () => {
  const fb = "生成失敗，請稍後再試";
  assert.match(geminiErrorMessage(new Error("Gemini 429: RESOURCE_EXHAUSTED quota"), fb), /配額/);
  // 用 2.5 flash 撞每日上限 → 建議改 Flash-Lite；flash-lite 自己撞上限則不建議再換
  assert.match(geminiErrorMessage(new Error('Gemini 429: quota model: gemini-2.5-flash'), fb), /Flash-Lite/);
  assert.doesNotMatch(geminiErrorMessage(new Error('Gemini 429: quota model: gemini-2.5-flash-lite'), fb), /建議.*Flash-Lite/);
  assert.match(geminiErrorMessage(new Error("Gemini 400: API key not valid. API_KEY_INVALID"), fb), /金鑰/);
  assert.match(geminiErrorMessage(new Error("Gemini 生成中止，原因: SAFETY"), fb), /安全過濾/);
  assert.match(geminiErrorMessage(new Error("無 Gemini 金鑰"), fb), /綁定/);
  assert.match(geminiErrorMessage(new Error("Gemini 生成中止，原因: MAX_TOKENS"), fb), /截斷/);
  assert.equal(geminiErrorMessage(new Error("某個未知錯誤"), fb), fb);
});

test("2.5 flash／flash-lite 關閉思考（thinkingBudget:0），避免思考吃掉輸出額度", () => {
  assert.deepEqual(buildGenerationConfig(0.9, 1024, "gemini-2.5-flash"), { temperature: 0.9, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } });
  assert.deepEqual(buildGenerationConfig(0.9, 1024, "gemini-2.5-flash-lite").thinkingConfig, { thinkingBudget: 0 });
});

test("非 flash 模型（pro／舊版）不送 thinkingConfig，避免不支援的 400", () => {
  assert.equal(buildGenerationConfig(0.9, 1024, "gemini-2.5-pro").thinkingConfig, undefined);
  assert.equal(buildGenerationConfig(0.9, 1024, "gemini-1.5-flash-latest").thinkingConfig, undefined);
});

test("串接多個 text parts（thinking 模型常把輸出拆段）", () => {
  const json = { candidates: [{ content: { parts: [{ text: "上半段，" }, { text: "下半段。" }] } }] };
  assert.equal(extractGeminiText(json), "上半段，下半段。");
});

test("略過 thought 片段，只取答案", () => {
  const json = { candidates: [{ content: { parts: [{ text: "我在想…", thought: true }, { text: "正式答案" }] } }] };
  assert.equal(extractGeminiText(json), "正式答案");
});

test("單一 part 照舊可用", () => {
  const json = { candidates: [{ content: { parts: [{ text: "只有一段" }] } }] };
  assert.equal(extractGeminiText(json), "只有一段");
});

test("無 parts／畸形回傳回空字串（呼叫端判斷）", () => {
  assert.equal(extractGeminiText({}), "");
  assert.equal(extractGeminiText({ candidates: [{}] }), "");
  assert.equal(extractGeminiText(null), "");
});
