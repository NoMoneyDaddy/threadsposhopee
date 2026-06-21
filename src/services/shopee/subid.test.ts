import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSubId, normalizeSubIds } from "./subid";

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
