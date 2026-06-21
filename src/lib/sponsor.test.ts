import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSponsorConfig } from "./sponsor";

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
