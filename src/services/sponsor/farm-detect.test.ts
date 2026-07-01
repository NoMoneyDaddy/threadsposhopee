import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateFarm, FARM_MIN_ACCOUNTS } from "./farm-detect";

const base = { accountCount: 0, permanentOffCount: 0, penalizedCount: 0, blockedCount: 0, optOutCount: 0, ownerDebt: 0 };

test("evaluateFarm：帳號數不足門檻一律不標", () => {
  const r = evaluateFarm({ ...base, accountCount: FARM_MIN_ACCOUNTS - 1, permanentOffCount: 3, blockedCount: 3 });
  assert.equal(r.suspect, false);
  assert.equal(r.reasons.length, 0);
});

test("evaluateFarm：規避帳號佔比達半數即可疑", () => {
  const r = evaluateFarm({ ...base, accountCount: 6, permanentOffCount: 3 });
  assert.equal(r.suspect, true);
  assert.ok(r.reasons.some((x) => x.includes("規避狀態")));
});

test("evaluateFarm：高欠抽單獨即標記", () => {
  const r = evaluateFarm({ ...base, accountCount: 5, ownerDebt: 5 });
  assert.equal(r.suspect, true);
  assert.ok(r.reasons.some((x) => x.includes("欠抽")));
});

test("evaluateFarm：帳號多但無規避傾向不標", () => {
  const r = evaluateFarm({ ...base, accountCount: 8, optOutCount: 1 });
  assert.equal(r.suspect, false);
});
