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

test("verdictFromResponse：格式異常（null/非陣列）＝safe（不誤判為威脅）", () => {
  assert.equal(verdictFromResponse(null), "safe");
  assert.equal(verdictFromResponse({ matches: "x" }), "safe");
});
