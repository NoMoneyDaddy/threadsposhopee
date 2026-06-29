import { test } from "node:test";
import assert from "node:assert/strict";
import { itemIdFromCleanUrl } from "./refresh-link";

test("itemIdFromCleanUrl：從 /product/<shop>/<item> 取 itemId", () => {
  assert.equal(itemIdFromCleanUrl("https://shopee.tw/product/1439789451/27877163278"), "27877163278");
  assert.equal(itemIdFromCleanUrl("https://shopee.tw/product/1439789451/27877163278?x=1"), "27877163278");
});

test("itemIdFromCleanUrl：非商品連結／空值 → 空字串", () => {
  assert.equal(itemIdFromCleanUrl("https://s.shopee.tw/abc123"), "");
  assert.equal(itemIdFromCleanUrl(""), "");
  assert.equal(itemIdFromCleanUrl(null), "");
  assert.equal(itemIdFromCleanUrl(undefined), "");
});
