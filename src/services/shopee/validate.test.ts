import { test } from "node:test";
import assert from "node:assert/strict";
import { validateShopeeCredentials } from "./affiliate";

// 假的 global.fetch：模擬 Shopee GraphQL 各種回應，驗證「僅授權錯誤擋下、其餘放行」。
function stubFetch(res: { ok: boolean; status: number; body: unknown }) {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => ({
    ok: res.ok,
    status: res.status,
    json: async () => res.body,
    text: async () => JSON.stringify(res.body)
  })) as unknown as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

test("HTTP 401 → 擋下（ok:false）", async () => {
  const restore = stubFetch({ ok: false, status: 401, body: "unauthorized" });
  try {
    assert.equal((await validateShopeeCredentials("a", "b")).ok, false);
  } finally {
    restore();
  }
});

test("GraphQL 簽章錯誤 → 擋下（ok:false）", async () => {
  const restore = stubFetch({ ok: true, status: 200, body: { errors: [{ message: "Invalid Signature" }] } });
  try {
    assert.equal((await validateShopeeCredentials("a", "b")).ok, false);
  } finally {
    restore();
  }
});

test("有效憑證（回資料）→ 放行（ok:true）", async () => {
  const restore = stubFetch({ ok: true, status: 200, body: { data: { productOfferV2: { nodes: [] } } } });
  try {
    assert.equal((await validateShopeeCredentials("a", "b")).ok, true);
  } finally {
    restore();
  }
});

test("非授權的 GraphQL 錯誤 → 放行（無法歸因，不擋）", async () => {
  const restore = stubFetch({ ok: true, status: 200, body: { errors: [{ message: "rate limited" }] } });
  try {
    assert.equal((await validateShopeeCredentials("a", "b")).ok, true);
  } finally {
    restore();
  }
});

test("網路錯誤 → 放行（ok:true）", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("network down");
  }) as unknown as typeof fetch;
  try {
    assert.equal((await validateShopeeCredentials("a", "b")).ok, true);
  } finally {
    globalThis.fetch = original;
  }
});
