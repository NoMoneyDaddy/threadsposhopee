import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeDisplayName } from "./credentials";

test("normalizeDisplayName：去頭尾空白、壓縮連續空白", () => {
  assert.equal(normalizeDisplayName("  小明  "), "小明");
  assert.equal(normalizeDisplayName("海島　 選物"), "海島 選物"); // 全形空白＋空白 → 單一空白
});

test("normalizeDisplayName：移除控制字元、保留一般空白", () => {
  assert.equal(normalizeDisplayName("小明"), "小明"); // 控制字元被移除
  assert.equal(normalizeDisplayName("小 明"), "小 明"); // 一般空白保留
});

test("normalizeDisplayName：依字元上限 24（不切壞表情符號）", () => {
  assert.equal(normalizeDisplayName("a".repeat(30)), "a".repeat(24));
  // 表情符號（surrogate pair）算 1 字元，整顆保留不被截半
  const out = normalizeDisplayName("😀".repeat(30))!;
  assert.equal(Array.from(out).length, 24);
  assert.equal(out, "😀".repeat(24));
});

test("normalizeDisplayName：空字串／純空白／null → null（清除）", () => {
  assert.equal(normalizeDisplayName(""), null);
  assert.equal(normalizeDisplayName("   "), null);
  assert.equal(normalizeDisplayName(null), null);
  assert.equal(normalizeDisplayName(undefined), null);
});
