import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTaipeiDateTimeLocal } from "./datetime";

test("datetime-local 以 +08:00 解讀（不受瀏覽器時區影響）", () => {
  // 2026-06-20 12:00 台北 = 04:00 UTC
  assert.equal(parseTaipeiDateTimeLocal("2026-06-20T12:00").toISOString(), "2026-06-20T04:00:00.000Z");
});

test("接受含秒輸入，不會硬拼 :00 變無效字串", () => {
  assert.equal(parseTaipeiDateTimeLocal("2026-06-20T12:00:30").toISOString(), "2026-06-20T04:00:30.000Z");
});

test("格式不符回 Invalid Date（呼叫端以 isNaN 判斷）", () => {
  for (const bad of ["", "not a date", "2026-06-20", "2026/06/20 12:00"]) {
    assert.ok(Number.isNaN(parseTaipeiDateTimeLocal(bad).getTime()), `應為 Invalid Date：${bad}`);
  }
});
