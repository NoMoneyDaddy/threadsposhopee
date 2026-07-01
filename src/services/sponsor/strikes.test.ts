import { test } from "node:test";
import assert from "node:assert/strict";
import { weightedStrikes, linkStillPresent, shortCodeOf } from "./run";

const DAY = 24 * 60 * 60 * 1000;

test("weightedStrikes：近 7 天每次計 2 分、7–30 天計 1 分", () => {
  const now = 100 * DAY;
  // 兩次近期（<7天）＝4；一次舊的（15天前）＝1 → 5
  assert.equal(weightedStrikes([now - 1 * DAY, now - 3 * DAY, now - 15 * DAY], now), 5);
});

test("weightedStrikes：超過 30 天視窗外不計；未來時間忽略", () => {
  const now = 100 * DAY;
  assert.equal(weightedStrikes([now - 40 * DAY], now), 0);
  assert.equal(weightedStrikes([now + 5 * DAY], now), 0);
  assert.equal(weightedStrikes([], now), 0);
});

test("weightedStrikes：兩次近期即達門檻 3", () => {
  const now = 100 * DAY;
  assert.ok(weightedStrikes([now - 1 * DAY, now - 2 * DAY], now) >= 3);
});

test("shortCodeOf：取最後一段路徑、去查詢字串", () => {
  assert.equal(shortCodeOf("https://s.shopee.tw/abc123"), "abc123");
  assert.equal(shortCodeOf("https://s.shopee.tw/abc123?sub_id=x"), "abc123");
  assert.equal(shortCodeOf("https://s.shopee.tw/abc123/"), "abc123");
});

test("linkStillPresent：短碼仍在＝保留（不誤判竄改）；短碼被移除＝竄改", () => {
  const link = "https://s.shopee.tw/abc123";
  assert.equal(linkStillPresent("看這個 https://s.shopee.tw/abc123 讚", link), true); // 原樣
  assert.equal(linkStillPresent("看這個 s.shopee.tw/abc123?x=1 讚", link), true); // 外觀變、短碼仍在
  assert.equal(linkStillPresent("看這個 shp.ee/abc123 讚", link), true); // 重導變網域、短碼仍在
  assert.equal(linkStillPresent("看這個 https://s.shopee.tw/zzz999 讚", link), false); // 換掉＝竄改
  assert.equal(linkStillPresent("純文字沒有連結", link), false); // 移除＝竄改
  assert.equal(linkStillPresent("任何內容", null), true); // 無連結不驗
});
