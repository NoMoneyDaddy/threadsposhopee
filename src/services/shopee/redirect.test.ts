import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAffiliateRedirectLink } from "./affiliate";

test("組出 an_redir 連結，origin_link 經編碼", () => {
  const link = buildAffiliateRedirectLink("https://shopee.tw/product/123/456?x=1", "16308730014", ["threadspo", "src", "456"]);
  const u = new URL(link);
  assert.equal(u.origin + u.pathname, "https://s.shopee.tw/an_redir");
  assert.equal(u.searchParams.get("origin_link"), "https://shopee.tw/product/123/456?x=1");
  assert.equal(u.searchParams.get("affiliate_id"), "16308730014");
  assert.equal(u.searchParams.get("sub_id"), "threadspo-src-456");
});

test("sub_id 最多 5 個、過濾空值", () => {
  const link = buildAffiliateRedirectLink("https://shopee.tw/x", "1", ["a", "", "b", "c", "d", "e", "f"]);
  assert.equal(new URL(link).searchParams.get("sub_id"), "a-b-c-d-e");
});

test("沒有 subIds 時不帶 sub_id", () => {
  const link = buildAffiliateRedirectLink("https://shopee.tw/x", "1");
  assert.equal(new URL(link).searchParams.has("sub_id"), false);
});
