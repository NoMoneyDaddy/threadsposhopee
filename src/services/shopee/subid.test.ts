import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSubId, normalizeSubIds, resolveSubIdTemplate, isValidSubIdTemplate } from "./subid";

test("isValidSubIdTemplate: 允許變數＋英數底線、擋非法/過長", () => {
  assert.equal(isValidSubIdTemplate("{platform}_{date}"), true);
  assert.equal(isValidSubIdTemplate("shop_{account}"), true);
  assert.equal(isValidSubIdTemplate("a-b"), false); // 連字號非法
  assert.equal(isValidSubIdTemplate("中文"), false);
  assert.equal(isValidSubIdTemplate("a".repeat(51)), false);
});

test("resolveSubIdTemplate: 帶入日期/平台/帳號並正規化", () => {
  const ctx = { date: "20260621", platform: "threads", account: "acc12345" };
  assert.equal(resolveSubIdTemplate("{platform}_{date}", ctx), "threads_20260621");
  // 連字號非法 → 正規化移除
  assert.equal(resolveSubIdTemplate("{account}-{date}", ctx), "acc1234520260621");
  assert.equal(resolveSubIdTemplate("shop_{account}", ctx), "shop_acc12345");
  assert.equal(resolveSubIdTemplate("", ctx), "");
});

test("normalizeSubId: 僅留英數與底線、上限 50", () => {
  assert.equal(normalizeSubId("my shop@2026!"), "myshop2026");
  assert.equal(normalizeSubId("my_shop_2026"), "my_shop_2026");
  assert.equal(normalizeSubId("中文混English_1"), "English_1");
  assert.equal(normalizeSubId("a".repeat(60)).length, 50);
  assert.equal(normalizeSubId(null), "");
});

test("normalizeSubIds: 去空、去重、最多 5 個", () => {
  assert.deepEqual(normalizeSubIds(["a", "a", "", "b@", null, "c", "d", "e", "f"]), ["a", "b", "c", "d", "e"]);
});
