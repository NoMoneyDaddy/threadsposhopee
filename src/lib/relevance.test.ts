import { test } from "node:test";
import assert from "node:assert/strict";
import { isLowRelevance, productTextRelevance } from "./relevance";

test("相關文案：商品名多數出現在內文 → 不警示", () => {
  const name = "無線藍牙耳機";
  const text = "這款無線藍牙耳機戴起來很舒服，藍牙連線也很穩，推薦給找耳機的人。";
  assert.ok(productTextRelevance(name, text) >= 0.3);
  assert.equal(isLowRelevance(name, text), false);
});

test("掛羊頭：文案與商品完全無關 → 警示", () => {
  const name = "無線藍牙耳機";
  const text = "今天天氣真好，跟大家分享我家貓咪的日常，超級可愛～";
  assert.equal(isLowRelevance(name, text), true);
});

test("通用/佔位商品名不誤報", () => {
  assert.equal(isLowRelevance("商品 12345", "任何不相關的文字"), false);
  assert.equal(isLowRelevance("這個好物", "任何不相關的文字"), false);
});

test("空輸入不警示", () => {
  assert.equal(isLowRelevance(null, "x"), false);
  assert.equal(isLowRelevance("耳機", ""), false);
});
