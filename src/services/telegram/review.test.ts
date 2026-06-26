import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReviewPreview, TG_APPROVE_PREFIX, TG_REJECT_PREFIX } from "./review";

test("buildReviewPreview：有商品名 → 含 🛒 標題行", () => {
  const out = buildReviewPreview({ product_name: "藍牙耳機", main_text: "超好用推薦" });
  assert.match(out, /^📝 新草稿待審核\n🛒 藍牙耳機\n超好用推薦$/);
});

test("buildReviewPreview：無商品名 → 不含標題行", () => {
  const out = buildReviewPreview({ product_name: null, main_text: "只有內文" });
  assert.equal(out, "📝 新草稿待審核\n只有內文");
});

test("buildReviewPreview：正文壓成單行並截斷 180 字加省略號", () => {
  const out = buildReviewPreview({ product_name: null, main_text: `多行\n  含空白\t文字 ${"字".repeat(200)}` });
  // 換行/連續空白被壓成單一空格（內文不含原本的換行）
  assert.equal(out.includes("\n含"), false);
  // 超過 180 字 → 結尾加省略號；正文部分恰好截到 180 字
  assert.match(out, /…$/);
  const body = out.replace(/^📝 新草稿待審核\n/, "").replace(/…$/, "");
  assert.equal(body.length, 180);
});

test("buildReviewPreview：短正文不加省略號", () => {
  const out = buildReviewPreview({ product_name: null, main_text: "短" });
  assert.equal(out.endsWith("…"), false);
});

test("callback prefix 長度固定 4，apv/rej 不互為前綴", () => {
  assert.equal(TG_APPROVE_PREFIX.length, 4);
  assert.equal(TG_REJECT_PREFIX.length, 4);
  assert.equal(TG_APPROVE_PREFIX.startsWith(TG_REJECT_PREFIX), false);
});
