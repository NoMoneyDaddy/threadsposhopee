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

test("taipeiParts: 回傳日期字串與 0–23 小時", () => {
  const p = taipeiParts(new Date("2026-06-21T00:00:00Z")); // 台北 08:00
  assert.match(p.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(p.hour >= 0 && p.hour <= 23);
});

test("normalizeSponsorConfig: 啟用需有效連結", () => {
  const bad = normalizeSponsorConfig({ enabled: true, affiliateLink: "not-a-url", offPeakStart: 2, offPeakEnd: 5 });
  assert.equal(bad.ok, false);
  const good = normalizeSponsorConfig({ enabled: true, affiliateLink: "https://s.shopee.tw/abc", offPeakStart: 2, offPeakEnd: 5 });
  assert.equal(good.ok, true);
});

test("normalizeSponsorConfig: 停用時連結可空", () => {
  const r = normalizeSponsorConfig({ enabled: false, affiliateLink: "", offPeakStart: 2, offPeakEnd: 5 });
  assert.equal(r.ok, true);
});

test("normalizeSponsorConfig: 冷門時段界線", () => {
  assert.equal(normalizeSponsorConfig({ enabled: false, offPeakStart: 5, offPeakEnd: 5 }).ok, false);
  assert.equal(normalizeSponsorConfig({ enabled: false, offPeakStart: -1, offPeakEnd: 5 }).ok, false);
  assert.equal(normalizeSponsorConfig({ enabled: false, offPeakStart: 0, offPeakEnd: 24 }).ok, true);
});
