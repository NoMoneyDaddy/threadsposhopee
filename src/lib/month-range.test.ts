import { test } from "node:test";
import assert from "node:assert/strict";
import { monthBounds, monthsBetween } from "./month-range";

test("monthBounds：一般月份起訖", () => {
  assert.deepEqual(monthBounds("2026-03"), { after: "2026-03-01", before: "2026-03-31" });
});

test("monthBounds：二月閏年/平年最後一天", () => {
  assert.equal(monthBounds("2024-02")?.before, "2024-02-29"); // 閏年
  assert.equal(monthBounds("2026-02")?.before, "2026-02-28"); // 平年
});

test("monthBounds：非法格式 → null", () => {
  assert.equal(monthBounds("2026-13"), null);
  assert.equal(monthBounds("2026-00"), null);
  assert.equal(monthBounds("2026/03"), null);
  assert.equal(monthBounds(""), null);
});

test("monthsBetween：跨年展開、含頭尾", () => {
  assert.deepEqual(monthsBetween("2025-11", "2026-02"), ["2025-11", "2025-12", "2026-01", "2026-02"]);
});

test("monthsBetween：單月", () => {
  assert.deepEqual(monthsBetween("2026-03", "2026-03"), ["2026-03"]);
});

test("monthsBetween：超過上限則截斷", () => {
  const r = monthsBetween("2025-01", "2026-12", 12);
  assert.equal(r.length, 12);
  assert.equal(r[0], "2025-01");
  assert.equal(r[11], "2025-12"); // 截在第 12 個，未到 endYm
});

test("monthsBetween：start 晚於 end 或非法 → 空", () => {
  assert.deepEqual(monthsBetween("2026-05", "2026-03"), []);
  assert.deepEqual(monthsBetween("bad", "2026-03"), []);
});
