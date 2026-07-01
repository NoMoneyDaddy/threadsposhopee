import { test } from "node:test";
import assert from "node:assert/strict";
import { explainError } from "./error-explain";

test("explainError：Gemini 503 過載", () => {
  assert.match(explainError("Gemini 503: high demand, UNAVAILABLE") ?? "", /過載|重試/);
});

test("explainError：429 配額", () => {
  assert.match(explainError("Gemini 429: quota exceeded") ?? "", /配額|速率/);
});

test("explainError：Threads 容器 code 24 未就緒", () => {
  assert.match(explainError('發布失敗 400: {"error":{"code":24,"error_subcode":4279009}}') ?? "", /容器尚未就緒|重試/);
});

test("explainError：token 過期 → 重新授權", () => {
  assert.match(explainError("Threads 190: access token expired") ?? "", /授權|帳號管理/);
});

test("explainError：一般 5xx／逾時", () => {
  assert.match(explainError("publish failed: timeout") ?? "", /逾時|稍後|異常/);
});

test("explainError：無對應或空值回 null", () => {
  assert.equal(explainError("某個沒有代碼的訊息"), null);
  assert.equal(explainError(""), null);
  assert.equal(explainError(null), null);
});
