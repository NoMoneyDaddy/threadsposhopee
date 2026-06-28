import { test } from "node:test";
import assert from "node:assert/strict";
import { cloudinaryFolder } from "./cloudinary";

test("cloudinaryFolder：有 keyHint → sanitize 並分到商品資料夾", () => {
  assert.equal(cloudinaryFolder("123_456", "threads/uploads"), "threads/123_456");
  // 非法字元被移除（只留英數/底線/連字號）
  assert.equal(cloudinaryFolder("12/3 4@5.6", "threads/uploads"), "threads/123456");
});

test("cloudinaryFolder：截斷 64 字", () => {
  const long = "a".repeat(100);
  const out = cloudinaryFolder(long, "threads/uploads");
  assert.equal(out, `threads/${"a".repeat(64)}`);
});

test("cloudinaryFolder：無 keyHint → 用 fallback", () => {
  assert.equal(cloudinaryFolder(undefined, "threads/uploads"), "threads/uploads");
  assert.equal(cloudinaryFolder("", "threads/videos"), "threads/videos");
});

test("cloudinaryFolder：keyHint 全非法字元 sanitize 後為空 → 退回 fallback（不落空 threads/）", () => {
  assert.equal(cloudinaryFolder("///", "threads/uploads"), "threads/uploads");
  assert.equal(cloudinaryFolder("@@@ ###", "threads/images"), "threads/images");
});
