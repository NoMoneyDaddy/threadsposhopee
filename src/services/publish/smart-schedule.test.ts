import { test } from "node:test";
import assert from "node:assert/strict";
import { spreadScheduleHours } from "./smart-schedule";

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
