import { test } from "node:test";
import assert from "node:assert/strict";
import { isSponsorExempt, canOwnLink, contributionAdjustedPerPosts, SPONSOR_EXEMPT_CONTRIBUTION, OWN_LINK_CONTRIBUTION } from "./contribution";

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

test("contributionAdjustedPerPosts：分數越高 perPosts 越大（抽越少），單調不減", () => {
  assert.equal(contributionAdjustedPerPosts(6, 0), 6); // 無貢獻＝原值
  assert.equal(contributionAdjustedPerPosts(6, SPONSOR_EXEMPT_CONTRIBUTION), 12); // 達門檻＝約 2×
  assert.ok(contributionAdjustedPerPosts(6, 10) >= 6 && contributionAdjustedPerPosts(6, 10) <= 12);
  // 超過門檻夾住（達門檻後另由 exempt 完全免抽）
  assert.equal(contributionAdjustedPerPosts(6, 999), 12);
  // 邊界：非正 perPosts 原樣回、下限 1
  assert.equal(contributionAdjustedPerPosts(0, 5), 0);
});

