import { test } from "node:test";
import assert from "node:assert/strict";
import { isAffiliateLink, isOwnAffiliateLink } from "./affiliate-link";

test("isAffiliateLink：an_redir / affiliate_id → 已是分潤", () => {
  assert.equal(isAffiliateLink("https://s.shopee.tw/an_redir?origin_link=https://shopee.tw/x&affiliate_id=123"), true);
  assert.equal(isAffiliateLink("https://shopee.tw/product/1/2?affiliate_id=999"), true);
});

test("isAffiliateLink：分潤/分享短連結網域 → 已是分潤", () => {
  assert.equal(isAffiliateLink("https://s.shopee.tw/abcd1234"), true);
  assert.equal(isAffiliateLink("https://shope.ee/abcd1234"), true);
  assert.equal(isAffiliateLink("https://shp.ee/abcd1234"), true);
});

test("isAffiliateLink：一般商品/商城連結 → 不是分潤（需轉換）", () => {
  assert.equal(isAffiliateLink("https://shopee.tw/product/123/456"), false);
  assert.equal(isAffiliateLink("https://shopee.tw/shop/50662979"), false);
});

test("isAffiliateLink：非法字串 → false", () => {
  assert.equal(isAffiliateLink("not a url"), false);
  assert.equal(isAffiliateLink(""), false);
});

test("isOwnAffiliateLink：affiliate_id 等於本人 → true（an_redir 與帶參數商品連結皆是）", () => {
  assert.equal(isOwnAffiliateLink("https://s.shopee.tw/an_redir?origin_link=https://shopee.tw/x&affiliate_id=123", "123"), true);
  assert.equal(isOwnAffiliateLink("https://shopee.tw/product/1/2?affiliate_id=123", "123"), true);
  assert.equal(isOwnAffiliateLink("https://s.shopee.tw/an_redir?affiliate_id=123", " 123 "), true); // 前後空白容錯
});

test("isOwnAffiliateLink：affiliate_id 是他人 → false（照常重產成本人連結）", () => {
  assert.equal(isOwnAffiliateLink("https://s.shopee.tw/an_redir?origin_link=https://shopee.tw/x&affiliate_id=999", "123"), false);
});

test("isOwnAffiliateLink：不透明短連結／無 affiliate_id → false（看不出歸屬，不誤判本人）", () => {
  assert.equal(isOwnAffiliateLink("https://s.shopee.tw/abcd1234", "123"), false);
  assert.equal(isOwnAffiliateLink("https://shopee.tw/product/1/2", "123"), false);
});

test("isOwnAffiliateLink：本人未設 affiliate_id 或連結非法 → false", () => {
  assert.equal(isOwnAffiliateLink("https://shopee.tw/product/1/2?affiliate_id=123", null), false);
  assert.equal(isOwnAffiliateLink("https://shopee.tw/product/1/2?affiliate_id=123", ""), false);
  assert.equal(isOwnAffiliateLink("not a url", "123"), false);
});
