import { test } from "node:test";
import assert from "node:assert/strict";
import { warmupDailyCap } from "./cadence";

test("warmupDailyCap：關閉（warmupDays<=0）回 maxPerDay", () => {
  assert.equal(warmupDailyCap(5, 0, 0), 5);
  assert.equal(warmupDailyCap(5, -3, 0), 5);
});

test("warmupDailyCap：暖機期內線性遞增、至少 1、不超過 max", () => {
  // 7 天暖機、max 5：day0 → ceil(5*1/7)=1，day3 → ceil(5*4/7)=3，day6 → ceil(5*7/7)=5
  assert.equal(warmupDailyCap(5, 7, 0), 1);
  assert.equal(warmupDailyCap(5, 7, 3), 3);
  assert.equal(warmupDailyCap(5, 7, 6), 5);
});

test("warmupDailyCap：滿暖機期後回 maxPerDay", () => {
  assert.equal(warmupDailyCap(5, 7, 7), 5);
  assert.equal(warmupDailyCap(5, 7, 100), 5);
});

test("warmupDailyCap：負 ageDays 視為 0", () => {
  assert.equal(warmupDailyCap(10, 5, -2), warmupDailyCap(10, 5, 0));
});
