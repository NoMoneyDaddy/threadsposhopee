import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSubId, normalizeSubIds, resolveSubIdTemplate, isValidSubIdTemplate, parseSubIdSlots, subIdDateTimeParts } from "./subid";

test("subIdDateTimeParts: 台北時區 YYYYMMDD / HHmm（UTC+8 跨日）", () => {
  // UTC 2026-01-01 17:30 = 台北 2026-01-02 01:30
  const p = subIdDateTimeParts(new Date("2026-01-01T17:30:00Z"));
  assert.equal(p.date, "20260102");
  assert.equal(p.time, "0130");
});

test("parseSubIdSlots: 逗號分隔、去空、最多 5 格", () => {
  assert.deepEqual(parseSubIdSlots("a, b ,,c"), ["a", "b", "c"]);
  assert.deepEqual(parseSubIdSlots(""), []);
  assert.deepEqual(parseSubIdSlots(null), []);
  assert.deepEqual(parseSubIdSlots("1,2,3,4,5,6,7"), ["1", "2", "3", "4", "5"]);
});

test("isValidSubIdTemplate: 允許變數＋英數、擋底線/連字號/非法/過長", () => {
  assert.equal(isValidSubIdTemplate("{platform}{date}"), true);
  assert.equal(isValidSubIdTemplate("shop{account}"), true);
  assert.equal(isValidSubIdTemplate("{platform}_{date}"), false); // 底線蝦皮拒收
  assert.equal(isValidSubIdTemplate("a-b"), false); // 連字號非法
  assert.equal(isValidSubIdTemplate("中文"), false);
  assert.equal(isValidSubIdTemplate("a".repeat(51)), false);
});

test("resolveSubIdTemplate: 帶入日期/平台/帳號並正規化（底線/連字號移除）", () => {
  const ctx = { date: "20260621", platform: "threads", account: "acc12345" };
  assert.equal(resolveSubIdTemplate("{platform}{date}", ctx), "threads20260621");
  // 連字號、底線皆非法 → 正規化移除
  assert.equal(resolveSubIdTemplate("{account}-{date}", ctx), "acc1234520260621");
  assert.equal(resolveSubIdTemplate("shop_{account}", ctx), "shopacc12345");
  assert.equal(resolveSubIdTemplate("", ctx), "");
});

test("resolveSubIdTemplate: 新增 {time}/{item} 變數（缺值＝空字串）", () => {
  const ctx = { date: "20260621", time: "0930", platform: "threads", account: "acc1", item: "778899" };
  assert.equal(resolveSubIdTemplate("{date}{time}", ctx), "202606210930");
  assert.equal(resolveSubIdTemplate("{account}{item}", ctx), "acc1778899");
  // 缺 time/item 時代換為空字串、不殘留括號
  assert.equal(resolveSubIdTemplate("{account}{item}", { date: "20260621", platform: "threads", account: "acc1" }), "acc1");
  assert.equal(isValidSubIdTemplate("{time}{item}"), true);
});

test("normalizeSubId: 僅留英數（底線也去掉，蝦皮拒收）、上限 50", () => {
  assert.equal(normalizeSubId("my shop@2026!"), "myshop2026");
  assert.equal(normalizeSubId("my_shop_2026"), "myshop2026"); // 底線移除
  assert.equal(normalizeSubId("rabbit_0984"), "rabbit0984");
  assert.equal(normalizeSubId("中文混English_1"), "English1");
  assert.equal(normalizeSubId("a".repeat(60)).length, 50);
  assert.equal(normalizeSubId(null), "");
});

test("normalizeSubIds: 去空、去重、最多 5 個", () => {
  assert.deepEqual(normalizeSubIds(["a", "a", "", "b@", null, "c", "d", "e", "f"]), ["a", "b", "c", "d", "e"]);
});
