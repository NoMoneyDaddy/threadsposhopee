import { test } from "node:test";
import assert from "node:assert/strict";
import { nextOpenSlot } from "./slots";

// 固定基準時間：2026-06-18T01:00:00Z = 台北 09:00。預設時段 09:00/12:30/20:00。
const base = Date.parse("2026-06-18T01:00:00Z");

test("回傳當天下一個未來時段（台北 12:30 = 04:30Z）", () => {
  const iso = nextOpenSlot(new Set(), base);
  assert.equal(iso, "2026-06-18T04:30:00.000Z");
});

test("跳過已占用時段，取下一個（20:00 = 12:00Z）", () => {
  const taken = new Set(["2026-06-18T04:30:00.000Z"]);
  const iso = nextOpenSlot(taken, base);
  assert.equal(iso, "2026-06-18T12:00:00.000Z");
});

test("當天時段排滿 → 跳到隔天第一個（09:00 = 隔天 01:00Z）", () => {
  const taken = new Set([
    "2026-06-18T04:30:00.000Z",
    "2026-06-18T12:00:00.000Z"
  ]);
  const iso = nextOpenSlot(taken, base);
  assert.equal(iso, "2026-06-19T01:00:00.000Z");
});

test("已過的時段（09:00 < now 09:00 同刻）不選自身，選下一個", () => {
  const iso = nextOpenSlot(new Set(), base);
  assert.notEqual(iso, "2026-06-18T01:00:00.000Z");
});
