import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isSponsorExempt,
  canOwnLink,
  combinedContributionScore,
  SPONSOR_EXEMPT_CONTRIBUTION,
  OWN_LINK_CONTRIBUTION
} from "./contribution";

test("isSponsorExempt：達門檻才免贊助文", () => {
  assert.equal(isSponsorExempt(SPONSOR_EXEMPT_CONTRIBUTION - 1), false);
  assert.equal(isSponsorExempt(SPONSOR_EXEMPT_CONTRIBUTION), true);
  assert.equal(isSponsorExempt(0), false);
});

test("combinedContributionScore：被匯入次數＋分享篇數並計", () => {
  assert.equal(combinedContributionScore(0, 0), 0);
  assert.equal(combinedContributionScore(10, 3), 13);
  // 分享但尚未被匯入仍有分（鼓勵貢獻）
  assert.equal(combinedContributionScore(0, 4), 4);
  // 負/NaN 視為 0
  assert.equal(combinedContributionScore(-5, Number.NaN), 0);
});

test("canOwnLink：自賺門檻更高於免贊助", () => {
  assert.ok(OWN_LINK_CONTRIBUTION > SPONSOR_EXEMPT_CONTRIBUTION);
  assert.equal(canOwnLink(OWN_LINK_CONTRIBUTION - 1), false);
  assert.equal(canOwnLink(OWN_LINK_CONTRIBUTION), true);
  // 達免贊助但未達自賺
  assert.equal(isSponsorExempt(SPONSOR_EXEMPT_CONTRIBUTION), true);
  assert.equal(canOwnLink(SPONSOR_EXEMPT_CONTRIBUTION), false);
});

