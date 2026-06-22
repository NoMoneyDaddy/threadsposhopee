import { test } from "node:test";
import assert from "node:assert/strict";
import { isAffiliateLink } from "./affiliate-link";

test("isAffiliateLink：an_redir / affiliate_id → 已是分潤", () => {
  assert.equal(isAffiliateLink("https://s.shopee.tw/an_redir?origin_link=https://shopee.tw/x&affiliate_id=123"), true);
  assert.equal(isAffiliateLink("https://shopee.tw/product/1/2?affiliate_id=999"), true);
});

test("isAffiliateLink：分潤/分享短連結網域 → 已是分潤", () => {
  assert.equal(isAffiliateLink("https://s.shopee.tw/abcd1234"), true);
  assert.equal(isAffiliateLink("https://shope.ee/abcd1234"), true);
});

test("isAffiliateLink：一般商品/商城連結 → 不是分潤（需轉換）", () => {
  assert.equal(isAffiliateLink("https://shopee.tw/product/123/456"), false);
  assert.equal(isAffiliateLink("https://shopee.tw/shop/50662979"), false);
});

test("isAffiliateLink：非法字串 → false", () => {
  assert.equal(isAffiliateLink("not a url"), false);
  assert.equal(isAffiliateLink(""), false);
});
