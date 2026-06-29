import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeScrapeKeywords, normalizePostsLimit, normalizeScrapeUsername, normalizeScrapeSort, normalizeScrapeDate, DEFAULT_SCRAPE_KEYWORD, MAX_SCRAPE_KEYWORDS, SCRAPE_POSTS_MAX } from "./scrape-config";

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

test("normalizePostsLimit：夾 1..1000、取整、非數值退回 3", () => {
  assert.equal(normalizePostsLimit(0), 1);
  assert.equal(normalizePostsLimit(9999), SCRAPE_POSTS_MAX);
  assert.equal(SCRAPE_POSTS_MAX, 1000);
  assert.equal(normalizePostsLimit(800), 800);
  assert.equal(normalizePostsLimit(4.6), 5);
  assert.equal(normalizePostsLimit("x"), 3);
});

test("normalizeScrapeUsername：去前導 @／空白、空字串＝不限帳號", () => {
  assert.equal(normalizeScrapeUsername("@shopee_tw"), "shopee_tw");
  assert.equal(normalizeScrapeUsername("  user.name  "), "user.name");
  assert.equal(normalizeScrapeUsername(""), "");
  assert.equal(normalizeScrapeUsername("   "), "");
  assert.equal(normalizeScrapeUsername(undefined), "");
});

test("normalizeScrapeUsername：非法字元拋錯（不靜默改字元）", () => {
  assert.throws(() => normalizeScrapeUsername("bad name"));
  assert.throws(() => normalizeScrapeUsername("@@user"));
  assert.throws(() => normalizeScrapeUsername("user/slash"));
});

test("normalizeScrapeSort：只接受 top/recent，其餘退回 recent", () => {
  assert.equal(normalizeScrapeSort("top"), "top");
  assert.equal(normalizeScrapeSort("recent"), "recent");
  assert.equal(normalizeScrapeSort("weird"), "recent");
  assert.equal(normalizeScrapeSort(undefined), "recent");
  assert.equal(normalizeScrapeSort(123), "recent");
});

test("normalizeScrapeDate：空＝不限、合法 YYYY-MM-DD 保留、非法拋錯", () => {
  assert.equal(normalizeScrapeDate(""), "");
  assert.equal(normalizeScrapeDate("  "), "");
  assert.equal(normalizeScrapeDate(undefined), "");
  assert.equal(normalizeScrapeDate("2026-06-29"), "2026-06-29");
  assert.throws(() => normalizeScrapeDate("2026/06/29"));
  assert.throws(() => normalizeScrapeDate("2026-13-40")); // 格式對但非真實日期
  assert.throws(() => normalizeScrapeDate("June 29"));
});
