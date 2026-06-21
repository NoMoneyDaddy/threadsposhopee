import { test } from "node:test";
import assert from "node:assert/strict";
import { assertSafePublicUrl, fetchSafePublicUrl } from "./url-guard";

// 以替身 global.fetch 驗 fetchSafePublicUrl 的「逐跳驗證」行為；測完還原。
function withMockFetch(
  handler: (url: string, init: RequestInit) => { status: number; location?: string },
  fn: () => Promise<void>
) {
  const orig = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: string | URL, init: RequestInit = {}) => {
    const url = typeof input === "string" ? input : input.href;
    calls.push(url);
    const { status, location } = handler(url, init);
    const headers = new Headers();
    if (location) headers.set("location", location);
    return new Response(null, { status, headers });
  }) as typeof fetch;
  return fn()
    .then(() => calls)
    .finally(() => {
      globalThis.fetch = orig;
    });
}

test("放行正常公開 https URL，回傳正規化 URL", () => {
  const u = assertSafePublicUrl("https://cdn.shopee.tw/file/abc.jpg");
  assert.equal(u.hostname, "cdn.shopee.tw");
  assert.equal(u.href, "https://cdn.shopee.tw/file/abc.jpg");
});

test("擋掉非 http(s) 協定", () => {
  assert.throws(() => assertSafePublicUrl("file:///etc/passwd"));
  assert.throws(() => assertSafePublicUrl("ftp://example.com/x"));
});

test("擋掉 localhost 與 IPv4 內網/保留位址", () => {
  for (const bad of [
    "http://localhost/x",
    "http://127.0.0.1/x",
    "http://10.0.0.5/x",
    "http://192.168.1.1/x",
    "http://172.16.0.1/x",
    "http://169.254.1.1/x",
    "http://100.64.0.1/x",
    "http://0.0.0.0/x"
  ]) {
    assert.throws(() => assertSafePublicUrl(bad), new RegExp("內網"), `應擋下 ${bad}`);
  }
});

test("擋掉 IPv6 迴環/ULA/link-local/multicast，但放行一般網域", () => {
  for (const bad of ["http://[::1]/x", "http://[fc00::1]/x", "http://[fe80::1]/x", "http://[ff02::1]/x", "http://[::]/x"]) {
    assert.throws(() => assertSafePublicUrl(bad), `應擋下 ${bad}`);
  }
  // 不可因前綴誤擋一般網域
  assert.doesNotThrow(() => assertSafePublicUrl("https://fc-barcelona.com/x"));
  assert.doesNotThrow(() => assertSafePublicUrl("https://fdic.gov/x"));
});

test("擋掉等價編碼繞過：十進位/十六進位整數、IPv4-mapped IPv6", () => {
  for (const bad of [
    "http://2130706433/x", // 十進位 127.0.0.1
    "http://0x7f000001/x", // 十六進位 127.0.0.1
    "http://3232235521/x", // 十進位 192.168.0.1
    "http://[::ffff:127.0.0.1]/x", // IPv4-mapped IPv6（點分）
    "http://[::ffff:7f00:1]/x" // IPv4-mapped IPv6（十六進位群組）
  ]) {
    assert.throws(() => assertSafePublicUrl(bad), `應擋下 ${bad}`);
  }
  // 公開 IP 的等價編碼不可誤擋（16843009 = 1.1.1.1）
  assert.doesNotThrow(() => assertSafePublicUrl("http://16843009/x"));
});

test("無效字串丟錯", () => {
  assert.throws(() => assertSafePublicUrl("not a url"));
});

test("fetchSafePublicUrl：重定向導向內網被擋（SSRF）", async () => {
  await withMockFetch(
    (url) => (url.includes("evil.example") ? { status: 302, location: "http://169.254.169.254/latest/meta-data/" } : { status: 200 }),
    async () => {
      await assert.rejects(() => fetchSafePublicUrl("https://evil.example/go"), /不允許存取內網位址/);
    }
  );
});

test("fetchSafePublicUrl：跟隨公網重定向並逐跳驗證，回最終回應", async () => {
  const calls = await withMockFetch(
    (url) => (url.includes("/start") ? { status: 301, location: "https://cdn.shopee.tw/final.jpg" } : { status: 200 }),
    async () => {
      const res = await fetchSafePublicUrl("https://shp.ee/start");
      assert.equal(res.status, 200);
    }
  );
  assert.deepEqual(calls, ["https://shp.ee/start", "https://cdn.shopee.tw/final.jpg"]);
});

test("fetchSafePublicUrl：3xx 無 Location 直接回該回應", async () => {
  await withMockFetch(
    () => ({ status: 304 }),
    async () => {
      const res = await fetchSafePublicUrl("https://cdn.shopee.tw/x.jpg");
      assert.equal(res.status, 304);
    }
  );
});

test("fetchSafePublicUrl：跨網域重定向剝除敏感 Header，同網域保留", async () => {
  const seen: Record<string, string | null> = {};
  await withMockFetch(
    (url, init) => {
      const auth = new Headers(init.headers).get("authorization");
      if (url.includes("a.example/start")) {
        seen.firstHop = auth; // 初始（同網域）應保留
        return { status: 302, location: "https://b.example/next" };
      }
      seen.crossHop = auth; // 跨網域應為 null
      return { status: 200 };
    },
    async () => {
      const res = await fetchSafePublicUrl("https://a.example/start", { headers: { authorization: "Bearer secret" } });
      assert.equal(res.status, 200);
    }
  );
  assert.equal(seen.firstHop, "Bearer secret");
  assert.equal(seen.crossHop, null);
});

test("fetchSafePublicUrl：重定向過多丟錯", async () => {
  await withMockFetch(
    () => ({ status: 302, location: "https://cdn.shopee.tw/loop" }),
    async () => {
      await assert.rejects(() => fetchSafePublicUrl("https://cdn.shopee.tw/loop"), /重定向次數過多/);
    }
  );
});
