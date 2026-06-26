import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSponsorConfig, inOffPeak, swapAffiliateLink, shouldSponsor, taipeiParts } from "./sponsor";

test("inOffPeak: [start,end) 半開區間", () => {
  assert.equal(inOffPeak(2, 2, 5), true);
  assert.equal(inOffPeak(4, 2, 5), true);
  assert.equal(inOffPeak(5, 2, 5), false);
  assert.equal(inOffPeak(1, 2, 5), false);
});

test("swapAffiliateLink: 有舊連結就替換，沒有就補在結尾", () => {
  assert.equal(swapAffiliateLink("買這個 https://s.shopee.tw/me 讚", "https://s.shopee.tw/me", "https://s.shopee.tw/plat"), "買這個 https://s.shopee.tw/plat 讚");
  assert.equal(swapAffiliateLink("純文字", null, "https://s.shopee.tw/plat"), "純文字\nhttps://s.shopee.tw/plat");
  assert.equal(swapAffiliateLink("", null, "https://s.shopee.tw/plat"), "");
});

test("shouldSponsor: 啟用＋非owner＋冷門時段＋今天未做", () => {
  const base = { enabled: true, isOwnerAccount: false, hour: 3, offPeakStart: 2, offPeakEnd: 5, alreadyDoneToday: false };
  assert.equal(shouldSponsor(base), true);
  assert.equal(shouldSponsor({ ...base, isOwnerAccount: true }), false);
  assert.equal(shouldSponsor({ ...base, alreadyDoneToday: true }), false);
  assert.equal(shouldSponsor({ ...base, hour: 12 }), false);
  assert.equal(shouldSponsor({ ...base, enabled: false }), false);
});

test("shouldSponsor: 使用者自選一篇（pickDraftId）只認那篇、可改時段", () => {
  const base = { enabled: true, isOwnerAccount: false, hour: 12, offPeakStart: 2, offPeakEnd: 5, alreadyDoneToday: false };
  // 自選了 d1：非冷門時段也算（pickHour=null）
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
