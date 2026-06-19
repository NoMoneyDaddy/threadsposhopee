import { test } from "node:test";
import assert from "node:assert/strict";
import { validateApifyToken, validateGeminiKey } from "./keys";

// 用假的 global.fetch 控制回應狀態碼／拋錯，驗證「明確被拒擋下、其餘放行」的規則。
function stubFetch(impl: () => Promise<{ status: number }>) {
  const original = globalThis.fetch;
  globalThis.fetch = impl as unknown as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

test("Apify 401/403 → 擋下（ok:false）", async () => {
  for (const status of [401, 403]) {
    const restore = stubFetch(async () => ({ status }));
    const r = await validateApifyToken("bad");
    restore();
    assert.equal(r.ok, false);
  }
});

test("Apify 200 → 放行（ok:true）", async () => {
  const restore = stubFetch(async () => ({ status: 200 }));
  const r = await validateApifyToken("good");
  restore();
  assert.equal(r.ok, true);
});

test("Apify 網路錯誤 → 無法確認，放行", async () => {
  const restore = stubFetch(async () => {
    throw new Error("network down");
  });
  const r = await validateApifyToken("whatever");
  restore();
  assert.equal(r.ok, true);
});

test("Gemini 400/401/403 → 擋下（ok:false）", async () => {
  for (const status of [400, 401, 403]) {
    const restore = stubFetch(async () => ({ status }));
    const r = await validateGeminiKey("bad");
    restore();
    assert.equal(r.ok, false);
  }
});

test("Gemini 200 → 放行（ok:true）", async () => {
  const restore = stubFetch(async () => ({ status: 200 }));
  const r = await validateGeminiKey("good");
  restore();
  assert.equal(r.ok, true);
});

test("Gemini 逾時拋錯 → 放行", async () => {
  const restore = stubFetch(async () => {
    throw new Error("timeout");
  });
  const r = await validateGeminiKey("whatever");
  restore();
  assert.equal(r.ok, true);
});
