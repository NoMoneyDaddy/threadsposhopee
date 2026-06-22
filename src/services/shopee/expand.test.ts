import { test } from "node:test";
import assert from "node:assert/strict";
import { parseShopeeIds } from "./expand";

test("parseShopeeIds：/product/<shop>/<item> 格式", () => {
  assert.deepEqual(parseShopeeIds("https://shopee.tw/product/123456/7891011"), {
    shopId: "123456",
    itemId: "7891011"
  });
});

test("parseShopeeIds：i.<shop>.<item> 格式", () => {
  assert.deepEqual(parseShopeeIds("https://shopee.tw/某商品-i.222.333?xptdk=abc"), {
    shopId: "222",
    itemId: "333"
  });
});

test("parseShopeeIds：先還原 &amp; 實體再比對", () => {
  assert.deepEqual(parseShopeeIds("https://shopee.tw/product/9/8?a=1&amp;b=2"), { shopId: "9", itemId: "8" });
});

test("parseShopeeIds：分潤短連結展開後 /<slug>/<shop>/<item> 格式", () => {
  assert.deepEqual(
    parseShopeeIds("https://shopee.tw/opaanlp/16416577/17686209143?__mobile__=1&utm_medium=affiliates"),
    { shopId: "16416577", itemId: "17686209143" }
  );
});

test("parseShopeeIds：無法比對回 null", () => {
  assert.equal(parseShopeeIds("https://shopee.tw/"), null);
  assert.equal(parseShopeeIds("https://example.com/x"), null);
});
