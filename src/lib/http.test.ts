import { test } from "node:test";
import assert from "node:assert/strict";
import { retryAfterMs, fetchWithRetry } from "./http";

test("retryAfterMs：秒數格式", () => {
  assert.equal(retryAfterMs("3"), 3000);
  assert.equal(retryAfterMs("0"), 0);
});

test("retryAfterMs：HTTP-date 與壞值", () => {
  const now = Date.parse("2026-06-20T00:00:00Z");
  assert.equal(retryAfterMs("Sat, 20 Jun 2026 00:00:02 GMT", now), 2000);
  assert.equal(retryAfterMs(null), null);
  assert.equal(retryAfterMs("abc"), null);
  assert.equal(retryAfterMs(""), null);
  assert.equal(retryAfterMs("   "), null); // 純空白不可變成 0ms
});

function stubFetch(statuses: number[]): { calls: number; restore: () => void } {
  const original = globalThis.fetch;
  const state = { calls: 0 };
  globalThis.fetch = (async () => {
    const status = statuses[Math.min(state.calls, statuses.length - 1)];
    state.calls++;
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: () => "0" }, // Retry-After: 0 → 不真的等待
      json: async () => ({}),
      text: async () => ""
    };
  }) as unknown as typeof fetch;
  return { get calls() { return state.calls; }, restore: () => { globalThis.fetch = original; } };
}

test("fetchWithRetry：429 後重試直到成功", async () => {
  const stub = stubFetch([429, 429, 200]);
  try {
    const res = await fetchWithRetry("https://x.test", {}, 1000, 3);
    assert.equal(res.status, 200);
    assert.equal(stub.calls, 3);
  } finally {
    stub.restore();
  }
});

test("fetchWithRetry：非 429 不重試（單次）", async () => {
  const stub = stubFetch([500]);
  try {
    const res = await fetchWithRetry("https://x.test", {}, 1000, 3);
    assert.equal(res.status, 500);
    assert.equal(stub.calls, 1);
  } finally {
    stub.restore();
  }
});

test("fetchWithRetry：429 持續 → 用盡 attempts 後回最後一個", async () => {
  const stub = stubFetch([429]);
  try {
    const res = await fetchWithRetry("https://x.test", {}, 1000, 3);
    assert.equal(res.status, 429);
    assert.equal(stub.calls, 3);
  } finally {
    stub.restore();
  }
});
