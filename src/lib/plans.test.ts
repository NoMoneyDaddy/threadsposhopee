import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePlan, planLimits, PLANS } from "./plans";

test("normalizePlan：合法值原樣回傳", () => {
  assert.equal(normalizePlan("free"), "free");
  assert.equal(normalizePlan("pro"), "pro");
  assert.equal(normalizePlan("business"), "business");
});

test("normalizePlan：未知／缺值一律退回 free（最保守）", () => {
  assert.equal(normalizePlan("enterprise"), "free");
  assert.equal(normalizePlan(""), "free");
  assert.equal(normalizePlan(null), "free");
  assert.equal(normalizePlan(undefined), "free");
  assert.equal(normalizePlan(123), "free");
});

test("planLimits：查表得限額，未知退 free 額度", () => {
  assert.equal(planLimits("pro").maxThreadsAccounts, PLANS.pro.maxThreadsAccounts);
  assert.equal(planLimits("???").maxThreadsAccounts, PLANS.free.maxThreadsAccounts);
});

test("方案級距遞增（free < pro < business）", () => {
  assert.ok(PLANS.free.maxThreadsAccounts < PLANS.pro.maxThreadsAccounts);
  assert.ok(PLANS.pro.maxThreadsAccounts < PLANS.business.maxThreadsAccounts);
});
