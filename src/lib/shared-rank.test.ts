import { test } from "node:test";
import assert from "node:assert/strict";
import { sharedRankScore, type SharedMaterial } from "./materials-store";

function row(shop: string, item: string, importCount: number): SharedMaterial {
  return {
    id: `${shop}-${item}`,
    owner_id: "o",
    shop_id: shop,
    item_id: item,
    product_name: "p",
    clean_product_url: null,
    media_type: "none",
    cloudinary_media_url: null,
    main_text: null,
    reply_text: null,
    import_count: importCount,
    favorite_count: 0,
    review_status: "approved",
    affiliate_valid: true,
    created_at: "2026-07-01T00:00:00Z"
  };
}

test("sharedRankScore：熱門(匯入)＋成效(發布×3)加權", () => {
  const published = new Map<string, number>([["10:100", 5]]);
  // 匯入 2 ＋ 發布 5×3 = 17
  assert.equal(sharedRankScore(row("10", "100", 2), published), 17);
  // 無發布資料：只算匯入
  assert.equal(sharedRankScore(row("20", "200", 8), published), 8);
});

test("sharedRankScore：成效高者勝過純匯入高者", () => {
  const published = new Map<string, number>([["1:1", 10]]);
  const withPerf = sharedRankScore(row("1", "1", 1), published); // 1 + 30
  const importOnly = sharedRankScore(row("2", "2", 20), published); // 20
  assert.ok(withPerf > importOnly);
});

test("sharedRankScore：未給 map 或負值安全處理", () => {
  assert.equal(sharedRankScore(row("1", "1", 3)), 3);
  assert.equal(sharedRankScore(row("1", "1", -5)), 0);
});

test("sharedRankScore：發文互動(views/likes)以對數加權併入", () => {
  const eng = new Map([["9:9", { views: 10000, likes: 100 }]]);
  // 匯入 2 ＋ log10(1+10000)≈4 ×4 ＝16 ＋ log10(1+100)≈2 ×4 ＝8 → 2+16+8=26
  assert.equal(sharedRankScore(row("9", "9", 2), undefined, eng), 26);
  // 無互動資料：不影響（只算匯入）
  assert.equal(sharedRankScore(row("9", "9", 2), undefined, new Map()), 2);
});
