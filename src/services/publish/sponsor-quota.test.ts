import { test } from "node:test";
import assert from "node:assert/strict";
import { sponsorQuota } from "./sponsor-quota";

test("sponsorQuota：預設 perPosts=6, floor=1", () => {
  assert.equal(sponsorQuota(0), 0);
  assert.equal(sponsorQuota(1), 1); // 保底
  assert.equal(sponsorQuota(5), 1);
  assert.equal(sponsorQuota(6), 1);
  assert.equal(sponsorQuota(7), 1);
  assert.equal(sponsorQuota(12), 2);
  assert.equal(sponsorQuota(13), 2);
  assert.equal(sponsorQuota(18), 3);
});

test("sponsorQuota：minPostsForFloor 避免極輕量用戶被保底重抽", () => {
  const opts = { minPostsForFloor: 3 };
  assert.equal(sponsorQuota(1, opts), 0);
  assert.equal(sponsorQuota(2, opts), 0);
  assert.equal(sponsorQuota(3, opts), 1);
  assert.equal(sponsorQuota(12, opts), 2); // 仍按量
});

test("sponsorQuota：perPosts 當抽成率槓桿（貢獻者抽更少）", () => {
  assert.equal(sponsorQuota(12, { perPosts: 12 }), 1); // 1/12
  assert.equal(sponsorQuota(24, { perPosts: 12 }), 2);
});

test("sponsorQuota：非法輸入回 0", () => {
  assert.equal(sponsorQuota(-3), 0);
  assert.equal(sponsorQuota(Number.NaN), 0);
  assert.equal(sponsorQuota(6, { perPosts: 0 }), 0);
});
