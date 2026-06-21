import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveInsightsRange, taipeiMs, INSIGHTS_PERIODS } from "./insights-range";

test("taipeiMs: 合法日期換算（台北 UTC+8）、非法回 null", () => {
  // 台北 2026-06-21 00:00 = UTC 2026-06-20 16:00
  assert.equal(taipeiMs("2026-06-21", false), Date.parse("2026-06-20T16:00:00Z"));
  // 迄日為當天 23:59:59（台北）
  assert.equal(taipeiMs("2026-06-21", true), Date.parse("2026-06-21T15:59:59Z"));
  assert.equal(taipeiMs("2026/06/21", false), null);
  assert.equal(taipeiMs("bad", false), null);
});

test("resolveInsightsRange: 自訂區間優先且 from<=to", () => {
  const r = resolveInsightsRange({ from: "2026-06-01", to: "2026-06-21" });
  assert.equal(r.custom, true);
  assert.equal(r.startMs, taipeiMs("2026-06-01", false));
  assert.equal(r.endMs, taipeiMs("2026-06-21", true));
  assert.match(r.label, /2026-06-01 ~ 2026-06-21/);
});

test("resolveInsightsRange: from>to 視為無效 → 退回預設 days", () => {
  const r = resolveInsightsRange({ from: "2026-06-21", to: "2026-06-01" });
  assert.equal(r.custom, false);
  assert.equal(r.days, 30);
});

test("resolveInsightsRange: days 僅接受白名單，否則 30", () => {
  assert.equal(resolveInsightsRange({ days: "7" }).days, 7);
  assert.equal(resolveInsightsRange({ days: "999" }).days, 30);
  assert.equal(resolveInsightsRange({}).days, 30);
  // 預設窗約等於 days 天
  const r = resolveInsightsRange({ days: "7" });
  assert.ok(Math.abs(r.endMs - r.startMs - 7 * 86400_000) < 1000);
  assert.ok(INSIGHTS_PERIODS.some((p) => p.days === 7));
});
