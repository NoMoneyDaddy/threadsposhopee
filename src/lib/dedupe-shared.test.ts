import { test } from "node:test";
import assert from "node:assert/strict";
import { dedupeSharedByProduct, type SharedMaterial } from "./materials-store";

function row(id: string, shop: string, item: string, importCount: number): SharedMaterial {
  return {
    id,
    owner_id: `owner-${id}`,
    shop_id: shop,
    item_id: item,
    product_name: `p-${id}`,
    clean_product_url: `https://shopee.tw/product/${shop}/${item}`,
    media_type: "none",
    cloudinary_media_url: null,
    main_text: null,
    reply_text: null,
    import_count: importCount,
    created_at: "2026-06-22T00:00:00Z"
  };
}

test("dedupeSharedByProduct：同商品(shop+item)只留第一筆（呼叫端已依 import_count 排序）", () => {
  const rows = [row("a", "10", "100", 5), row("b", "10", "100", 3), row("c", "20", "200", 1)];
  const out = dedupeSharedByProduct(rows);
  assert.deepEqual(out.map((m) => m.id), ["a", "c"]);
});

test("dedupeSharedByProduct：不同 shop 同 item 視為不同商品", () => {
  const rows = [row("a", "10", "100", 1), row("b", "20", "100", 1)];
  assert.equal(dedupeSharedByProduct(rows).length, 2);
});

test("dedupeSharedByProduct：空陣列回空", () => {
  assert.deepEqual(dedupeSharedByProduct([]), []);
});
