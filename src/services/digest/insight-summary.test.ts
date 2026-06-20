import { test } from "node:test";
import assert from "node:assert/strict";
import { buildInsightPrompt } from "./insight-summary";

const base = {
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

test("buildInsightPrompt：含角色設定與精簡規則", () => {
  const p = buildInsightPrompt({ ...base, publishedLast24h: 3, approved: 2 });
  assert.match(p, /營運顧問/);
  assert.match(p, /最多 3 點/);
  assert.match(p, /近24h已發布：3 篇/);
  assert.match(p, /佇列待發：2 篇/);
});

test("buildInsightPrompt：有觸及驟降與收益時帶入事實", () => {
  const p = buildInsightPrompt({
    ...base,
    revenue: { commission: 88.5, conversions: 3 },
    reachDrop: { recentMedian: 30, baselineMedian: 200, ratio: 0.15 }
  });
  assert.match(p, /分潤收益：NT\$88\.50/);
  assert.match(p, /觸及驟降/);
  assert.match(p, /15%/);
});

test("buildInsightPrompt：待辦問題彙整成一行", () => {
  const p = buildInsightPrompt({ ...base, draftsFailed: 2, tokenExpiring: 1 });
  assert.match(p, /待辦：/);
  assert.match(p, /發布失敗 2/);
  assert.match(p, /token即將到期 1/);
});
