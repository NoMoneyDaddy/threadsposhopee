import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSponsorConfig, inOffPeak, swapAffiliateLink, shouldSponsor, taipeiParts, formatCommissionRate } from "./sponsor";

test("formatCommissionRate：小數轉百分比、去多餘小數、無效回 null", () => {
  assert.equal(formatCommissionRate("0.05"), "5%");
  assert.equal(formatCommissionRate("0.125"), "12.5%");
  assert.equal(formatCommissionRate("0"), "0%");
  assert.equal(formatCommissionRate(null), null);
  assert.equal(formatCommissionRate(""), null);
  assert.equal(formatCommissionRate("abc"), null);
  assert.equal(formatCommissionRate("-0.1"), null);
});

test("inOffPeak: [start,end) 半開區間", () => {
  assert.equal(inOffPeak(2, 2, 5), true);
  assert.equal(inOffPeak(4, 2, 5), true);
  assert.equal(inOffPeak(5, 2, 5), false);
  assert.equal(inOffPeak(1, 2, 5), false);
});

test("swapAffiliateLink: 有舊連結就替換；找不到就原文不動（不再 append）", () => {
  assert.equal(swapAffiliateLink("買這個 https://s.shopee.tw/me 讚", "https://s.shopee.tw/me", "https://s.shopee.tw/plat"), "買這個 https://s.shopee.tw/plat 讚");
  // 找不到原連結 → 原文不動（呼叫端據此放棄贊助，不硬接連結）
  assert.equal(swapAffiliateLink("純文字", null, "https://s.shopee.tw/plat"), "純文字");
  assert.equal(swapAffiliateLink("沒有商品連結的貼文", "https://s.shopee.tw/notfound", "https://s.shopee.tw/plat"), "沒有商品連結的貼文");
  assert.equal(swapAffiliateLink("", null, "https://s.shopee.tw/plat"), "");
});

test("shouldSponsor: 比例制——啟用＋非owner＋未達配額即贊助（不再限時段）", () => {
  const base = { enabled: true, isOwnerAccount: false, hour: 3, alreadyDoneToday: false };
  assert.equal(shouldSponsor(base), true);
  assert.equal(shouldSponsor({ ...base, isOwnerAccount: true }), false);
  assert.equal(shouldSponsor({ ...base, alreadyDoneToday: true }), false);
  // 任意時段皆可（配額由 alreadyDoneToday 控制，非時段）
  assert.equal(shouldSponsor({ ...base, hour: 12 }), true);
  assert.equal(shouldSponsor({ ...base, enabled: false }), false);
});

test("shouldSponsor: 使用者自選一篇（pickDraftId）只認那篇、可改時段", () => {
  const base = { enabled: true, isOwnerAccount: false, hour: 12, alreadyDoneToday: false };
  // 自選了 d1（pickHour=null）：一發即贊助
  assert.equal(shouldSponsor({ ...base, thisDraftId: "d1", pickDraftId: "d1" }), true);
  // 不是被選的那篇 → 不贊助
  assert.equal(shouldSponsor({ ...base, thisDraftId: "d2", pickDraftId: "d1" }), false);
  // 指定時段：只有該時才贊助
  assert.equal(shouldSponsor({ ...base, hour: 9, thisDraftId: "d1", pickDraftId: "d1", pickHour: 9 }), true);
  assert.equal(shouldSponsor({ ...base, hour: 10, thisDraftId: "d1", pickDraftId: "d1", pickHour: 9 }), false);
});

test("taipeiParts: 回傳日期字串與 0–23 小時", () => {
  const p = taipeiParts(new Date("2026-06-21T00:00:00Z")); // 台北 08:00
  assert.match(p.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(p.hour >= 0 && p.hour <= 23);
});

test("normalizeSponsorConfig: 啟用不需任何連結（改為就地改寫各篇貼文）", () => {
  // 只要開關＋合法時段即可（商品/連結改為自動就地改寫，不需設定）
  const r = normalizeSponsorConfig({ enabled: true, offPeakStart: 2, offPeakEnd: 5 });
  assert.equal(r.ok, true);
});

test("normalizeSponsorConfig: 冷門時段界線", () => {
  assert.equal(normalizeSponsorConfig({ enabled: false, offPeakStart: 5, offPeakEnd: 5 }).ok, false);
  assert.equal(normalizeSponsorConfig({ enabled: false, offPeakStart: -1, offPeakEnd: 5 }).ok, false);
  assert.equal(normalizeSponsorConfig({ enabled: false, offPeakStart: 0, offPeakEnd: 24 }).ok, true);
});

test("normalizeSponsorConfig: 比例制參數缺省套用預設、超範圍擋下", () => {
  // 缺省 → 套預設（perPosts 6 / floor 1 / minPostsForFloor 3）
  const r = normalizeSponsorConfig({ enabled: true, offPeakStart: 2, offPeakEnd: 5 });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.cfg.perPosts, 6);
    assert.equal(r.cfg.floor, 1);
    assert.equal(r.cfg.minPostsForFloor, 3);
  }
  // 自訂合法值
  const r2 = normalizeSponsorConfig({ enabled: true, offPeakStart: 2, offPeakEnd: 5, perPosts: 10, floor: 0, minPostsForFloor: 5 });
  assert.equal(r2.ok, true);
  if (r2.ok) assert.equal(r2.cfg.perPosts, 10);
  // 超範圍 / 非整數 → 擋下
  assert.equal(normalizeSponsorConfig({ enabled: true, offPeakStart: 2, offPeakEnd: 5, perPosts: 0 }).ok, false);
  assert.equal(normalizeSponsorConfig({ enabled: true, offPeakStart: 2, offPeakEnd: 5, minPostsForFloor: 0 }).ok, false);
  assert.equal(normalizeSponsorConfig({ enabled: true, offPeakStart: 2, offPeakEnd: 5, floor: -1 }).ok, false);
});
