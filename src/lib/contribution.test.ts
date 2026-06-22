import { test } from "node:test";
import assert from "node:assert/strict";
import { isSponsorExempt, SPONSOR_EXEMPT_CONTRIBUTION } from "./contribution";

test("isSponsorExempt：達門檻才免贊助文", () => {
  assert.equal(isSponsorExempt(SPONSOR_EXEMPT_CONTRIBUTION - 1), false);
  assert.equal(isSponsorExempt(SPONSOR_EXEMPT_CONTRIBUTION), true);
  assert.equal(isSponsorExempt(SPONSOR_EXEMPT_CONTRIBUTION + 10), true);
  assert.equal(isSponsorExempt(0), false);
});
