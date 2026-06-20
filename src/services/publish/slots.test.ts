import { test } from "node:test";
import assert from "node:assert/strict";
import { nextOpenSlot, nextOpenSlotAtHours } from "./slots";

// 固定基準時間：2026-06-18T01:00:00Z = 台北 09:00。預設時段 09:00/12:30/20:00。
const base = Date.parse("2026-06-18T01:00:00Z");

test("nextOpenSlotAtHours：依最佳時段整點挑下一個未來空檔（台北 20:00 = 12:00Z）", () => {
  // 台北 09:00 當下；最佳時段排序 [20, 9, 13] → 今天 20:00 仍在未來、最高優先
  const iso = nextOpenSlotAtHours(new Set(), [20, 9, 13], base);
  assert.equal(iso, "2026-06-18T12:00:00.000Z");
});

test("nextOpenSlotAtHours：最高優先時段已過則順延到次優（台北 09:00→次日才到 09，先選 13）", () => {
  // 台北 09:00 當下，hours=[9,13]：今天 09 已過(<=now) → 取今天 13:00 = 05:00Z
  const iso = nextOpenSlotAtHours(new Set(), [9, 13], base);
  assert.equal(iso, "2026-06-18T05:00:00.000Z");
});

test("nextOpenSlotAtHours：占用時跳到次日同時段", () => {
  const taken = new Set(["2026-06-18T12:00:00.000Z"]);
  const iso = nextOpenSlotAtHours(taken, [20], base);
  assert.equal(iso, "2026-06-19T12:00:00.000Z");
});

test("nextOpenSlotAtHours：空 hours 或非法值回 null", () => {
  assert.equal(nextOpenSlotAtHours(new Set(), [], base), null);
  assert.equal(nextOpenSlotAtHours(new Set(), [99, -1, 1.5], base), null);
});

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
