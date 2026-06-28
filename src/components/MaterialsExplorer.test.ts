import { test } from "node:test";
import assert from "node:assert/strict";
import { materialMatches } from "./MaterialsExplorer";
import type { Material } from "@/lib/types";

const base: Material = {
  id: "m1",
  owner_id: "o1",
  shop_id: "s1",
  item_id: "123456",
  product_name: "藍牙耳機 Pro",
  clean_product_url: null,
  affiliate_short_link: "https://s.shopee.tw/abcDEF",
  affiliate_sub_id: null,
  affiliate_generated_at: null,
  affiliate_valid: true,
  media_type: "none",
  source_media_url: null,
  cloudinary_media_url: null,
  product_name_raw: null,
  commission_rate: null,
  commission_checked_at: null,
  main_text: "限時優惠，快搶！",
  reply_text: null,
  ai_raw: null,
  ai_generated_at: null
} as Material;

test("空關鍵字全部命中", () => {
  assert.equal(materialMatches(base, ""), true);
});

test("命中商品名（不分大小寫）", () => {
  assert.equal(materialMatches(base, "藍牙"), true);
  assert.equal(materialMatches({ ...base, product_name: "Bluetooth" }, "bluetooth"), true);
});

test("命中文案／短連結／商品 id", () => {
  assert.equal(materialMatches(base, "限時"), true);
  assert.equal(materialMatches(base, "abcdef"), true); // 連結比對已小寫化
  assert.equal(materialMatches(base, "123456"), true);
});

test("不相關關鍵字不命中", () => {
  assert.equal(materialMatches(base, "不存在"), false);
});

test("欄位為 null 不拋錯", () => {
  const m = { ...base, product_name: null, main_text: null, affiliate_short_link: null } as Material;
  assert.equal(materialMatches(m, "123456"), true); // 仍可由 item_id 命中
  assert.equal(materialMatches(m, "藍牙"), false);
});
