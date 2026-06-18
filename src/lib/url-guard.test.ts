import { test } from "node:test";
import assert from "node:assert/strict";
import { assertSafePublicUrl } from "./url-guard";

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

test("無效字串丟錯", () => {
  assert.throws(() => assertSafePublicUrl("not a url"));
});
