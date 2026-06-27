import { test } from "node:test";
import assert from "node:assert/strict";
import { setTelegramWebhook, getTelegramWebhookInfo } from "./notify";

// 以 stub globalThis.fetch 覆蓋兩個 Telegram webhook 外呼包裝（fetchWithTimeout 走全域 fetch）。
type Captured = { url: string; init: RequestInit | undefined };
async function withFetch(
  responder: (url: string, init?: RequestInit) => Response,
  fn: (cap: Captured) => Promise<void>
) {
  const cap: Captured = { url: "", init: undefined };
  const orig = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    cap.url = String(input);
    cap.init = init;
    return responder(cap.url, init);
  }) as typeof fetch;
  try {
    await fn(cap);
  } finally {
    globalThis.fetch = orig;
  }
}

test("setTelegramWebhook：成功時回 ok 並送出正確 url/secret/allowed_updates", async () => {
  await withFetch(
    () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    async (cap) => {
      const r = await setTelegramWebhook("TOK", "https://site.example/api/telegram/webhook", "SECRET");
      assert.equal(r.ok, true);
      assert.match(cap.url, /\/botTOK\/setWebhook$/);
      const body = JSON.parse(String(cap.init?.body));
      assert.equal(body.url, "https://site.example/api/telegram/webhook");
      assert.equal(body.secret_token, "SECRET");
      assert.deepEqual(body.allowed_updates, ["message", "callback_query"]);
    }
  );
});

test("setTelegramWebhook：Telegram 回 ok=false 時帶回 description", async () => {
  await withFetch(
    () => new Response(JSON.stringify({ ok: false, description: "bad url" }), { status: 400 }),
    async () => {
      const r = await setTelegramWebhook("TOK", "https://site.example/api/telegram/webhook", "SECRET");
      assert.equal(r.ok, false);
      assert.equal(r.description, "bad url");
    }
  );
});

test("getTelegramWebhookInfo：解析 url 與 last_error_message", async () => {
  await withFetch(
    () =>
      new Response(JSON.stringify({ ok: true, result: { url: "https://x/api", last_error_message: "boom" } }), {
        status: 200
      }),
    async () => {
      const info = await getTelegramWebhookInfo("TOK");
      assert.deepEqual(info, { url: "https://x/api", lastError: "boom" });
    }
  );
});

test("getTelegramWebhookInfo：Telegram 回 ok=false 時回 null（查詢失敗 ≠ 未註冊）", async () => {
  await withFetch(
    () => new Response(JSON.stringify({ ok: false }), { status: 200 }),
    async () => {
      assert.equal(await getTelegramWebhookInfo("TOK"), null);
    }
  );
});
