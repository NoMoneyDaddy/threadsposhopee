import { test } from "node:test";
import assert from "node:assert/strict";
import { isSponsorExempt, canOwnLink, contributionAdjustedPerPosts, contribTier, nextContribTier, SPONSOR_EXEMPT_CONTRIBUTION, SPONSOR_MAX_PER_POSTS, OWN_LINK_CONTRIBUTION } from "./contribution";

test("contribTier：四級門檻 0/15/40/100", () => {
  assert.equal(contribTier(0).key, "rookie");
  assert.equal(contribTier(14).key, "rookie");
  assert.equal(contribTier(15).key, "contributor");
  assert.equal(contribTier(40).key, "high");
  assert.equal(contribTier(100).key, "elite");
  assert.equal(contribTier(9999).key, "elite");
});

test("nextContribTier：回下一級、頂級回 null", () => {
  assert.equal(nextContribTier(0)?.key, "contributor");
  assert.equal(nextContribTier(40)?.key, "elite");
  assert.equal(nextContribTier(100), null);
});

test("isSponsorExempt / canOwnLink：對齊階梯門檻", () => {
  assert.equal(isSponsorExempt(SPONSOR_EXEMPT_CONTRIBUTION - 1), false);
  assert.equal(isSponsorExempt(SPONSOR_EXEMPT_CONTRIBUTION), true);
  assert.ok(OWN_LINK_CONTRIBUTION > SPONSOR_EXEMPT_CONTRIBUTION);
  assert.equal(canOwnLink(OWN_LINK_CONTRIBUTION - 1), false);
  assert.equal(canOwnLink(OWN_LINK_CONTRIBUTION), true); // 頂級才可自賺
});

test("contributionAdjustedPerPosts：分段倍數，封頂不歸零", () => {
  assert.equal(contributionAdjustedPerPosts(6, 0), 6); // 新手＝基礎
  assert.equal(contributionAdjustedPerPosts(6, 15), 12); // 貢獻者 ×2
  assert.equal(contributionAdjustedPerPosts(6, 40), 30); // 高貢獻 ×5
  assert.equal(contributionAdjustedPerPosts(6, 100), SPONSOR_MAX_PER_POSTS); // 頂級 ×10＝封頂 60
  assert.equal(contributionAdjustedPerPosts(6, 999999), SPONSOR_MAX_PER_POSTS); // 永不歸零
  assert.equal(contributionAdjustedPerPosts(0, 40), 0); // 非正原樣回
});

