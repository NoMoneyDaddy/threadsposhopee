import { test } from "node:test";
import assert from "node:assert/strict";
import { verdictFromResponse } from "./safe-browsing";

test("verdictFromResponse：空回應＝safe", () => {
  assert.equal(verdictFromResponse({}), "safe");
  assert.equal(verdictFromResponse({ matches: [] }), "safe");
});

test("verdictFromResponse：有 matches＝unsafe", () => {
  assert.equal(verdictFromResponse({ matches: [{ threatType: "MALWARE" }] }), "unsafe");
});

test("verdictFromResponse：解析失敗/格式異常＝unknown（不把未完成掃描誤判為安全）", () => {
  assert.equal(verdictFromResponse(null), "unknown"); // res.json() 失敗→null
  assert.equal(verdictFromResponse("not-json"), "unknown"); // 非物件
  assert.equal(verdictFromResponse({ matches: "x" }), "unknown"); // matches 存在但非陣列
});
