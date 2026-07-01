import { test } from "node:test";
import assert from "node:assert/strict";
import { weightedStrikes } from "./run";

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
