import { test } from "node:test";
import assert from "node:assert/strict";
import { spreadScheduleHours, buildSchedulePicker } from "./smart-schedule";
import { nextOpenSlotAtHours } from "./slots";

// 台北小時（Asia/Taipei 恆 +08:00）：驗證挑出來的 slot 落在預期整點。
function taipeiHour(iso: string): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Taipei", hour: "2-digit", hour12: false }).format(new Date(iso))
  ) % 24;
}
const BASE = Date.parse("2026-06-18T00:00:00Z"); // 固定起點，測試不依賴 Date.now()

test("spreadScheduleHours：取前 N 個並依時鐘順序排列（分散一整天）", () => {
  // 輸入＝依平均觀看由高到低排序的整點；輸出應為前 cap 個（取 20,9,12,7）、去重、依時鐘升序。
  assert.deepEqual(spreadScheduleHours([20, 9, 12, 7, 22, 0, 15], 4), [7, 9, 12, 20]);
});

test("spreadScheduleHours：去重", () => {
  assert.deepEqual(spreadScheduleHours([9, 9, 20, 20, 12], 6), [9, 12, 20]);
});

test("spreadScheduleHours：過濾非法整點（負/超過23/非整數）", () => {
  assert.deepEqual(spreadScheduleHours([9, -1, 24, 12.5, 23, 100], 6), [9, 23]);
});

test("spreadScheduleHours：空輸入回空（呼叫端據此退回預設時段）", () => {
  assert.deepEqual(spreadScheduleHours([], 6), []);
});

test("spreadScheduleHours：cap 至少 1（避免 0 把所有時段砍光）", () => {
  assert.deepEqual(spreadScheduleHours([20, 9, 12], 0), [20]); // cap 夾到 1：保留最佳的 1 個
});

test("spreadScheduleHours：cap 大於長度時全取", () => {
  assert.deepEqual(spreadScheduleHours([20, 9], 6), [9, 20]);
});

test("buildSchedulePicker：無成效時段 → usedBest=false，用預設時段", () => {
  const { pick, usedBest } = buildSchedulePicker([], ["09:00", "20:00"], {}, BASE, 30);
  assert.equal(usedBest, false);
  const slot = pick(new Set());
  assert.ok(slot, "應排得到預設時段");
  assert.ok([9, 20].includes(taipeiHour(slot!)), "落在預設時段整點");
});

test("buildSchedulePicker：有成效時段 → usedBest=true，排在最佳時段", () => {
  const { pick, usedBest } = buildSchedulePicker([13], ["09:00"], {}, BASE, 30);
  assert.equal(usedBest, true);
  const slot = pick(new Set());
  assert.equal(taipeiHour(slot!), 13);
});

test("buildSchedulePicker：最佳時段佔滿 → 優雅退回預設時段（不直接失敗）", () => {
  // 最佳時段只有 13 點、預設時段 20:00；把窗內所有 13 點 slot 佔滿後，picker 應退回 20:00。
  const hours = [13];
  const slots = ["20:00"];
  const { pick } = buildSchedulePicker(hours, slots, {}, BASE, 3);
  const taken = new Set<string>();
  for (let s = nextOpenSlotAtHours(taken, hours, BASE, 3, {}); s; s = nextOpenSlotAtHours(taken, hours, BASE, 3, {})) {
    taken.add(s);
  }
  const fb = pick(taken);
  assert.ok(fb, "最佳時段佔滿時仍應排得到時段（退回預設）");
  assert.equal(taipeiHour(fb!), 20, "退回到預設時段 20:00");
});
