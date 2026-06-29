import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeScrapeKeywords, normalizePostsLimit, DEFAULT_SCRAPE_KEYWORD, MAX_SCRAPE_KEYWORDS } from "./scrape-config";

test("normalizeScrapeKeywords：去空白/濾空/去重保序、空清單退回預設", () => {
  assert.deepEqual(normalizeScrapeKeywords([" a ", "a", "", "b"]), ["a", "b"]);
  assert.deepEqual(normalizeScrapeKeywords([]), [DEFAULT_SCRAPE_KEYWORD]);
  assert.deepEqual(normalizeScrapeKeywords("  "), [DEFAULT_SCRAPE_KEYWORD]);
  assert.deepEqual(normalizeScrapeKeywords(undefined), [DEFAULT_SCRAPE_KEYWORD]);
});

test("normalizeScrapeKeywords：字串以逗號/換行拆分", () => {
  assert.deepEqual(normalizeScrapeKeywords("s.shopee.tw, 開箱\n好物"), ["s.shopee.tw", "開箱", "好物"]);
});

test("normalizeScrapeKeywords：上限 10 個", () => {
  const many = Array.from({ length: 20 }, (_, i) => `k${i}`);
  assert.equal(normalizeScrapeKeywords(many).length, MAX_SCRAPE_KEYWORDS);
});

test("normalizePostsLimit：夾 1..20、取整、非數值退回 3", () => {
  assert.equal(normalizePostsLimit(0), 1);
  assert.equal(normalizePostsLimit(999), 20);
  assert.equal(normalizePostsLimit(4.6), 5);
  assert.equal(normalizePostsLimit("x"), 3);
});
