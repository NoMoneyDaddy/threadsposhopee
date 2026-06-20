import { test } from "node:test";
import assert from "node:assert/strict";
import { textSimilarity, maxSimilarity, normalizeForSim, charShingles } from "./text-similarity";

test("normalizeForSim：移除網址、壓空白、轉小寫", () => {
  assert.equal(normalizeForSim("買這個 https://s.shopee.tw/abc 超划算"), "買這個超划算");
  assert.equal(normalizeForSim("Hello   World"), "helloworld");
});

test("textSimilarity：完全相同=1、完全不同≈0", () => {
  assert.equal(textSimilarity("這是一段測試文案", "這是一段測試文案"), 1);
  assert.ok(textSimilarity("這是一段測試文案", "完全無關的另外內容ABCDEFG") < 0.1);
});

test("textSimilarity：只差分潤連結 → 視為近重複（高相似）", () => {
  const a = "限時優惠快來搶購 https://s.shopee.tw/aaa";
  const b = "限時優惠快來搶購 https://s.shopee.tw/zzz";
  assert.equal(textSimilarity(a, b), 1);
});

test("textSimilarity：小幅改寫 → 中等相似", () => {
  const sim = textSimilarity("這款保溫瓶超好用推薦給大家", "這款保溫瓶很好用推薦給你");
  assert.ok(sim > 0.3 && sim < 0.95, `相似度應落在中間，實際 ${sim}`);
});

test("maxSimilarity：取最高、空集合回 0", () => {
  assert.equal(maxSimilarity("abc", []), 0);
  assert.equal(maxSimilarity("這是測試文案內容", ["無關內容", "這是測試文案內容", "其他"]), 1);
});

test("charShingles：短於 n 時整串當一個 shingle", () => {
  assert.deepEqual([...charShingles("ab", 3)], ["ab"]);
  assert.equal(charShingles("", 3).size, 0);
});

test("charShingles：n 非正整數時拋錯", () => {
  assert.throws(() => charShingles("abc", 0));
  assert.throws(() => charShingles("abc", -1));
  assert.throws(() => charShingles("abc", 1.5));
});
