import { test } from "node:test";
import assert from "node:assert/strict";
import { parseApifyUsage } from "./usage";

test("parseApifyUsage：取本月用量＋上限，算剩餘", () => {
  const r = parseApifyUsage({ data: { current: { monthlyUsageUsd: 1.5 }, limits: { maxMonthlyUsageUsd: 5 } } });
  assert.deepEqual(r, { usedUsd: 1.5, limitUsd: 5, remainingUsd: 3.5 });
});

test("parseApifyUsage：無上限欄位 → limit/remaining 為 null", () => {
  const r = parseApifyUsage({ data: { current: { monthlyUsageUsd: 2 } } });
  assert.deepEqual(r, { usedUsd: 2, limitUsd: null, remainingUsd: null });
});

test("parseApifyUsage：用量超過上限 → 剩餘夾為 0（不為負）", () => {
  const r = parseApifyUsage({ data: { current: { monthlyUsageUsd: 7 }, limits: { maxMonthlyUsageUsd: 5 } } });
  assert.equal(r?.remainingUsd, 0);
});

test("parseApifyUsage：缺 data／用量非數值 → null", () => {
  assert.equal(parseApifyUsage(null), null);
  assert.equal(parseApifyUsage({}), null);
  assert.equal(parseApifyUsage({ data: { current: {} } }), null);
});
