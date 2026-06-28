import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldAutoOpenTour } from "./product-tour-logic";

// 互動導覽首次自動開啟的判斷邏輯（純函式）：要求 auto=true 且尚未看過（localStorage 無 seen flag）。
test("shouldAutoOpenTour：auto 且未看過 → 開啟", () => {
  assert.equal(shouldAutoOpenTour(true, null), true);
});

test("shouldAutoOpenTour：已看過（有 seen flag）→ 不開", () => {
  assert.equal(shouldAutoOpenTour(true, "1"), false);
});

test("shouldAutoOpenTour：auto 關閉 → 不開（即使未看過）", () => {
  assert.equal(shouldAutoOpenTour(false, null), false);
});
