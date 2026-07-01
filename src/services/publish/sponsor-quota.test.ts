import { test } from "node:test";
import assert from "node:assert/strict";
import { sponsorQuota, shouldSponsorCumulative, ownLinkThisSlot, sponsorWithDebt, shouldAccrueOptOutDebt } from "./sponsor-quota";

test("sponsorWithDebt：自身到比例就抽；沒到但 owner 有欠抽則代抽（fromDebt）", () => {
  // perPosts=6：自身 before=5 到比例 → 抽、非代抽
  assert.deepEqual(sponsorWithDebt(5, 0, 6, 0), { sponsor: true, fromDebt: false });
  // 自身沒到（before=2）、owner 無欠抽 → 不抽
  assert.deepEqual(sponsorWithDebt(2, 0, 6, 0), { sponsor: false, fromDebt: false });
  // 自身沒到、owner 有欠抽 → 代抽補還
  assert.deepEqual(sponsorWithDebt(2, 0, 6, 3), { sponsor: true, fromDebt: true });
});

test("shouldAccrueOptOutDebt：永久禁用帳號每 perPosts 篇轉一次欠抽", () => {
  // perPosts=6：已轉 0，發到第 6 篇（before=5）→ 轉
  assert.equal(shouldAccrueOptOutDebt(5, 0, 6), true);
  // 已轉 1、before=6（第 7 篇）→ 尚未到下一個 6 → 不轉
  assert.equal(shouldAccrueOptOutDebt(6, 1, 6), false);
  // 已轉 1、before=11（第 12 篇）→ 轉第 2 次
  assert.equal(shouldAccrueOptOutDebt(11, 1, 6), true);
});

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

test("sponsorQuota：低頻硬閘門——perPosts 比門檻小時，低於門檻仍為 0（不被 by-volume 抽到）", () => {
  const opts = { perPosts: 2, floor: 1, minPostsForFloor: 3 };
  assert.equal(sponsorQuota(1, opts), 0);
  assert.equal(sponsorQuota(2, opts), 0); // 2 < 門檻3 → 0，即使 ⌊2/2⌋=1
  assert.equal(sponsorQuota(3, opts), 1); // 達門檻 → max(1, ⌊3/2⌋=1)=1
  assert.equal(sponsorQuota(4, opts), 2); // max(1, ⌊4/2⌋=2)=2
});

test("sponsorQuota：非法輸入回 0", () => {
  assert.equal(sponsorQuota(-3), 0);
  assert.equal(sponsorQuota(Number.NaN), 0);
  assert.equal(sponsorQuota(6, { perPosts: 0 }), 0);
});

test("shouldSponsorCumulative：累積到第 perPosts 篇才抽，維持約 1/perPosts", () => {
  // perPosts=6：前 5 篇不抽（publishedBefore 0..4），第 6 篇（before=5）抽
  for (let before = 0; before < 5; before++) assert.equal(shouldSponsorCumulative(before, 0, 6), false);
  assert.equal(shouldSponsorCumulative(5, 0, 6), true); // 第 6 篇 → 抽
  assert.equal(shouldSponsorCumulative(11, 1, 6), true); // 第 12 篇、已抽 1 → 再抽
  assert.equal(shouldSponsorCumulative(6, 1, 6), false); // 第 7 篇、已抽 1 → 不抽
});

test("shouldSponsorCumulative：每天壓門檻下也逃不掉（累積計）", () => {
  // 每天發 2 篇、都不抽？累積到第 6 篇仍會抽（不因每日重置而逃過）
  assert.equal(shouldSponsorCumulative(5, 0, 6), true);
  assert.equal(shouldSponsorCumulative(0, 0, 0), false); // 非法 perPosts
});

test("ownLinkThisSlot：偶數序號留平台、奇數自賺（平台保底不歸零）", () => {
  assert.equal(ownLinkThisSlot(0), false); // 第 1 個贊助 → 平台
  assert.equal(ownLinkThisSlot(1), true); // 第 2 個 → 自賺
  assert.equal(ownLinkThisSlot(2), false);
  assert.equal(ownLinkThisSlot(3), true);
});
