import { test } from "node:test";
import assert from "node:assert/strict";
import { tokenExpiryState } from "./token-expiry";

const now = Date.parse("2026-06-20T00:00:00Z");
const inDays = (d: number) => new Date(now + d * 86_400_000).toISOString();

test("tokenExpiryState：無/壞到期日 → unknown", () => {
  assert.deepEqual(tokenExpiryState(null, 7, now), { level: "unknown", daysLeft: null });
  assert.deepEqual(tokenExpiryState("nope", 7, now), { level: "unknown", daysLeft: null });
});

test("tokenExpiryState：已過期 → expired（daysLeft<0）", () => {
  const r = tokenExpiryState(inDays(-1), 7, now);
  assert.equal(r.level, "expired");
  assert.ok(r.daysLeft !== null && r.daysLeft < 0);
});

test("tokenExpiryState：7 天內 → soon", () => {
  assert.equal(tokenExpiryState(inDays(3), 7, now).level, "soon");
  assert.equal(tokenExpiryState(inDays(7), 7, now).level, "soon");
});

test("tokenExpiryState：超過門檻 → ok", () => {
  const r = tokenExpiryState(inDays(30), 7, now);
  assert.equal(r.level, "ok");
  assert.equal(r.daysLeft, 30);
});
