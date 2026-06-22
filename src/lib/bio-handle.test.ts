import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeBioHandle } from "./credentials";

test("normalizeBioHandle：合法 → 轉小寫", () => {
  assert.equal(normalizeBioHandle("MyShop_01"), "myshop_01");
  assert.equal(normalizeBioHandle("  good-handle  "), "good-handle");
});

test("normalizeBioHandle：太短/太長/非法字元 → null", () => {
  assert.equal(normalizeBioHandle("ab"), null); // <3
  assert.equal(normalizeBioHandle("a".repeat(31)), null); // >30
  assert.equal(normalizeBioHandle("有中文"), null);
  assert.equal(normalizeBioHandle("with space"), null);
  assert.equal(normalizeBioHandle(""), null);
  assert.equal(normalizeBioHandle(null), null);
});
