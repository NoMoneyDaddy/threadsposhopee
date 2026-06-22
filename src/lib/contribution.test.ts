import { test } from "node:test";
import assert from "node:assert/strict";
import { isSponsorExempt, canOwnLink, SPONSOR_EXEMPT_CONTRIBUTION, OWN_LINK_CONTRIBUTION } from "./contribution";

test("isSponsorExempt：達門檻才免贊助文", () => {
  assert.equal(isSponsorExempt(SPONSOR_EXEMPT_CONTRIBUTION - 1), false);
  assert.equal(isSponsorExempt(SPONSOR_EXEMPT_CONTRIBUTION), true);
  assert.equal(isSponsorExempt(0), false);
});

test("canOwnLink：自賺門檻更高於免贊助", () => {
  assert.ok(OWN_LINK_CONTRIBUTION > SPONSOR_EXEMPT_CONTRIBUTION);
  assert.equal(canOwnLink(OWN_LINK_CONTRIBUTION - 1), false);
  assert.equal(canOwnLink(OWN_LINK_CONTRIBUTION), true);
  // 達免贊助但未達自賺
  assert.equal(isSponsorExempt(SPONSOR_EXEMPT_CONTRIBUTION), true);
  assert.equal(canOwnLink(SPONSOR_EXEMPT_CONTRIBUTION), false);
});

