import { test } from "node:test";
import assert from "node:assert/strict";
import { composeDailyDigest } from "./daily";

const baseInput = {
  publishedLast24h: 0,
  approved: 0,
  draftsFailed: 0,
  replyPending: 0,
  replyFailed: 0,
  invalidMaterials: 0,
  tokenExpiring: 0,
  topPosts: [],
  engagementTotals: null,
  revenue: null,
  reachDrop: null
};

test("composeDailyDigest：基本發布量一定有", () => {
  const s = composeDailyDigest({ ...baseInput, publishedLast24h: 5, approved: 3 });
  assert.match(s, /每日成效摘要/);
  assert.match(s, /已發布：5 篇/);
  assert.match(s, /佇列待發：3/);
});

test("composeDailyDigest：互動/熱門/收益齊全時都呈現", () => {
  const s = composeDailyDigest({
    ...baseInput,
    publishedLast24h: 2,
    engagementTotals: { views: 1200, likes: 80 },
    topPosts: [{ name: "保溫瓶", views: 900 }],
    revenue: { commission: 123.5, conversions: 4 }
  });
  assert.match(s, /👁 1,200/);
  assert.match(s, /保溫瓶（👁 900）/);
  assert.match(s, /NT\$ 123\.50（4 筆轉換）/);
});

test("composeDailyDigest：有問題時列出『需要注意』", () => {
  const s = composeDailyDigest({ ...baseInput, draftsFailed: 1, replyFailed: 2, invalidMaterials: 3, tokenExpiring: 1 });
  assert.match(s, /需要注意/);
  assert.match(s, /發布失敗 1/);
  assert.match(s, /留言失敗 2/);
  assert.match(s, /失效素材 3/);
  assert.match(s, /token 即將到期 1/);
});

test("composeDailyDigest：全 0 無問題時不出現『需要注意』", () => {
  const s = composeDailyDigest(baseInput);
  assert.doesNotMatch(s, /需要注意/);
});

test("composeDailyDigest：觸及驟降時帶預警行", () => {
  const s = composeDailyDigest({ ...baseInput, reachDrop: { recentMedian: 30, baselineMedian: 200, ratio: 0.15 } });
  assert.match(s, /觸及驟降預警/);
  assert.match(s, /15%/);
});
