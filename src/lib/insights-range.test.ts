import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveInsightsRange, INSIGHTS_PERIODS } from "./insights-range";

test("resolveInsightsRange: days 僅接受白名單，否則 30", () => {
  assert.equal(resolveInsightsRange({ days: "7" }).days, 7);
  assert.equal(resolveInsightsRange({ days: "999" }).days, 30);
  assert.equal(resolveInsightsRange({}).days, 30);
  // 預設窗約等於 days 天
  const r = resolveInsightsRange({ days: "7" });
  assert.ok(Math.abs(r.endMs - r.startMs - 7 * 86400_000) < 1000);
  assert.ok(INSIGHTS_PERIODS.some((p) => p.days === 7));
});

test("resolveInsightsRange: 不提供一年（365）區間 → 退回預設 30", () => {
  assert.equal(resolveInsightsRange({ days: "365" }).days, 30);
  assert.ok(!INSIGHTS_PERIODS.some((p) => p.days === 365));
});
