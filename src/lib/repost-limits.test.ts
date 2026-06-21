import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeRepostLimitsInput, exceedsRepostLimit, REPOST_LIMIT_MAX } from "./repost-limits";

test("normalizeRepostLimitsInput: 空白/缺值視為 0（不限）", () => {
  assert.deepEqual(normalizeRepostLimitsInput({}), { ok: true, perAccount: 0, total: 0 });
  assert.deepEqual(normalizeRepostLimitsInput({ perAccount: "", total: "" }), { ok: true, perAccount: 0, total: 0 });
});

test("normalizeRepostLimitsInput: 解析數字與字串", () => {
  assert.deepEqual(normalizeRepostLimitsInput({ perAccount: "3", total: 10 }), { ok: true, perAccount: 3, total: 10 });
});

test("normalizeRepostLimitsInput: 擋負數/非數字/過大", () => {
  assert.equal(normalizeRepostLimitsInput({ perAccount: -1 }).ok, false);
  assert.equal(normalizeRepostLimitsInput({ total: "abc" }).ok, false);
  assert.equal(normalizeRepostLimitsInput({ perAccount: REPOST_LIMIT_MAX + 1 }).ok, false);
});

test("normalizeRepostLimitsInput: 擋非整數（小數/尾隨垃圾），不靜默截斷", () => {
  assert.equal(normalizeRepostLimitsInput({ perAccount: "3.9" }).ok, false); // 舊 parseInt 會誤判 3
  assert.equal(normalizeRepostLimitsInput({ total: "5abc" }).ok, false); // 舊 parseInt 會誤判 5
  assert.equal(normalizeRepostLimitsInput({ perAccount: 2.5 }).ok, false);
});

test("exceedsRepostLimit: 0 不限、達標即擋", () => {
  assert.equal(exceedsRepostLimit({ perAccount: 0, total: 0 }, { perAccount: 99, total: 99 }).blocked, false);
  assert.equal(exceedsRepostLimit({ perAccount: 3, total: 0 }, { perAccount: 2, total: 5 }).blocked, false);
  assert.equal(exceedsRepostLimit({ perAccount: 3, total: 0 }, { perAccount: 3, total: 5 }).blocked, true);
  assert.equal(exceedsRepostLimit({ perAccount: 0, total: 10 }, { perAccount: 1, total: 10 }).blocked, true);
});
