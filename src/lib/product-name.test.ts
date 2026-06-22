import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanProductName } from "./product-name";

test("cleanProductName：去括號標籤群與促銷雜詞", () => {
  assert.equal(cleanProductName("【現貨】多功能 廚房 瀝水架 免運"), "多功能 廚房 瀝水架");
});

test("cleanProductName：去尾端 SKU 編號", () => {
  assert.equal(cleanProductName("懶人眼鏡 X712"), "懶人眼鏡");
  assert.equal(cleanProductName("露營捲尺燈 12345"), "露營捲尺燈");
});

test("cleanProductName：空/null → 空字串", () => {
  assert.equal(cleanProductName(null), "");
  assert.equal(cleanProductName(""), "");
});

test("cleanProductName：全被清空時退回原字串", () => {
  assert.equal(cleanProductName("【現貨】"), "【現貨】");
});

test("cleanProductName：過長截斷至 30 字", () => {
  const long = "超級無敵霹靂宇宙第一好用多功能廚房瀝水架收納神器置物架免治馬桶蓋加熱款";
  assert.ok([...cleanProductName(long)].length <= 30);
});
