import { test } from "node:test";
import assert from "node:assert/strict";
import { publishToThreads, parseRetryAfterMs, PublishUncertainError } from "./publish";

test("parseRetryAfterMs：秒數格式", () => {
  assert.equal(parseRetryAfterMs("120"), 120_000);
  assert.equal(parseRetryAfterMs("0"), 0);
});

test("parseRetryAfterMs：HTTP-date 格式 → 與 now 的差", () => {
  const now = Date.parse("2026-06-20T00:00:00Z");
  assert.equal(parseRetryAfterMs("Sat, 20 Jun 2026 00:00:30 GMT", now), 30_000);
  // 過去時間夾到 0，不為負
  assert.equal(parseRetryAfterMs("Sat, 20 Jun 2026 00:00:00 GMT", now + 5000), 0);
});

test("parseRetryAfterMs：無/壞值回 null", () => {
  assert.equal(parseRetryAfterMs(null), null);
  assert.equal(parseRetryAfterMs("abc"), null);
});

interface Call {
  url: string;
  method: string;
  body?: URLSearchParams;
}

// 攔截 global.fetch 記錄所有 Graph API 呼叫，並依 URL 回對應假回應。
function stubGraph(): { calls: Call[]; restore: () => void } {
  const calls: Call[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, method: init.method ?? "GET", body: init.body as URLSearchParams });
    const json =
      url.includes("threads_publish")
        ? { id: "post_123" }
        : url.includes("?fields=status")
          ? { status: "FINISHED" }
          : { id: `container_${calls.length}` };
    return { ok: true, status: 200, json: async () => json, text: async () => JSON.stringify(json) };
  }) as unknown as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

const base = { threadsUserId: "u1", accessToken: "t1" };

test("純文字：單一 TEXT 容器後發布", async () => {
  const { calls, restore } = stubGraph();
  try {
    const r = await publishToThreads({ ...base, text: "hi", media: [] });
    assert.equal(r.postId, "post_123");
    const creates = calls.filter((c) => c.url.endsWith("/threads") && c.method === "POST");
    assert.equal(creates.length, 1);
    assert.equal(creates[0].body?.get("media_type"), "TEXT");
    assert.equal(calls.filter((c) => c.url.includes("threads_publish")).length, 1);
  } finally {
    restore();
  }
});

test("單一圖片：IMAGE 容器帶 image_url", async () => {
  const { calls, restore } = stubGraph();
  try {
    await publishToThreads({ ...base, text: "x", media: [{ url: "https://example.com/a.jpg", type: "image" }] });
    const create = calls.find((c) => c.url.endsWith("/threads") && c.method === "POST");
    assert.equal(create?.body?.get("media_type"), "IMAGE");
    assert.equal(create?.body?.get("image_url"), "https://example.com/a.jpg");
  } finally {
    restore();
  }
});

test("多圖輪播：建子項 + CAROUSEL 母容器", async () => {
  const { calls, restore } = stubGraph();
  try {
    await publishToThreads({
      ...base,
      text: "carousel",
      media: [
        { url: "https://example.com/a.jpg", type: "image" },
        { url: "https://example.com/b.jpg", type: "image" }
      ]
    });
    const children = calls.filter((c) => c.method === "POST" && c.body?.get("is_carousel_item") === "true");
    assert.equal(children.length, 2);
    const carousel = calls.find((c) => c.method === "POST" && c.body?.get("media_type") === "CAROUSEL");
    assert.ok(carousel, "應建立 CAROUSEL 母容器");
    assert.equal(carousel?.body?.get("children")?.split(",").length, 2);
  } finally {
    restore();
  }
});

test("不安全的內網 media URL 應被擋下", async () => {
  const { restore } = stubGraph();
  try {
    await assert.rejects(
      () => publishToThreads({ ...base, text: "x", media: [{ url: "http://127.0.0.1/a.jpg", type: "image" }] })
    );
  } finally {
    restore();
  }
});

// 依 URL 決定哪個端點回失敗，用來驗證「發布步驟失敗 → 不確定」vs「建容器失敗 → 確定未發」。
function stubGraphFail(failOn: "publish" | "create"): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string) => {
    const url = String(input);
    const isPublish = url.includes("threads_publish");
    const shouldFail = failOn === "publish" ? isPublish : !isPublish;
    if (shouldFail) {
      return { ok: false, status: 500, json: async () => ({}), text: async () => "boom" };
    }
    const json = isPublish ? { id: "post_123" } : { id: "container_1" };
    return { ok: true, status: 200, json: async () => json, text: async () => JSON.stringify(json) };
  }) as unknown as typeof fetch;
  return () => { globalThis.fetch = original; };
}

test("發布步驟回 5xx → PublishUncertainError（可能已發出，待確認）", async () => {
  const restore = stubGraphFail("publish");
  try {
    await assert.rejects(
      () => publishToThreads({ ...base, text: "hi", media: [] }),
      (e: unknown) => e instanceof PublishUncertainError
    );
  } finally {
    restore();
  }
});

test("建容器步驟回 5xx → 一般錯誤（確定未發出，可安全重試）", async () => {
  const restore = stubGraphFail("create");
  try {
    await assert.rejects(
      () => publishToThreads({ ...base, text: "hi", media: [] }),
      (e: unknown) => e instanceof Error && !(e instanceof PublishUncertainError)
    );
  } finally {
    restore();
  }
});
