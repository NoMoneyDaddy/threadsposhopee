import { test } from "node:test";
import assert from "node:assert/strict";
import { isEvergreenDue } from "./materials-store";

const NOW = Date.parse("2026-06-22T00:00:00Z");
const DAY = 86400_000;

test("isEvergreenDue：從未重排（null/空）視為到期", () => {
  assert.equal(isEvergreenDue(null, NOW, 14), true);
  assert.equal(isEvergreenDue(undefined, NOW, 14), true);
  assert.equal(isEvergreenDue("not-a-date", NOW, 14), true);
});

test("isEvergreenDue：上次重排早於 minDays 天前 → 到期", () => {
  const last = new Date(NOW - 15 * DAY).toISOString();
  assert.equal(isEvergreenDue(last, NOW, 14), true);
});

test("isEvergreenDue：上次重排在 minDays 內 → 未到期", () => {
  const last = new Date(NOW - 13 * DAY).toISOString();
  assert.equal(isEvergreenDue(last, NOW, 14), false);
});

test("isEvergreenDue：剛好滿 minDays → 到期（>=）", () => {
  const last = new Date(NOW - 14 * DAY).toISOString();
  assert.equal(isEvergreenDue(last, NOW, 14), true);
});
