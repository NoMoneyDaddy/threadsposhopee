import { test } from "node:test";
import assert from "node:assert/strict";
import { replyDelayMinutes } from "./reply-timing";

test("逐則覆寫優先（含 0 = 立即）", () => {
  assert.equal(replyDelayMinutes("d1", 30, 10, 0), 0);
  assert.equal(replyDelayMinutes("d1", 30, 10, 5), 5);
  assert.equal(replyDelayMinutes("d1", 30, 10, 5.9), 5); // 取整
});

test("無覆寫：保底 + 抖動，落在 floor..floor+jitter", () => {
  const v = replyDelayMinutes("d1", 30, 10);
  assert.ok(v >= 30 && v <= 40);
});

test("同 seed 穩定", () => {
  assert.equal(replyDelayMinutes("d1", 30, 10), replyDelayMinutes("d1", 30, 10));
});

test("jitter 0 → 等於保底", () => {
  assert.equal(replyDelayMinutes("d1", 30, 0), 30);
});

test("負/NaN 覆寫忽略，退回保底", () => {
  assert.equal(replyDelayMinutes("d1", 30, 0, -5), 30);
  assert.equal(replyDelayMinutes("d1", 30, 0, NaN), 30);
});

test("floor NaN 防禦 → 視為 0", () => {
  assert.equal(replyDelayMinutes("d1", NaN, 0), 0);
});
