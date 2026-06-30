import { test } from "node:test";
import assert from "node:assert/strict";
import { bestPostingTimes, insightsHintKind, ownReplyAdjustedReplies } from "./engagement";

test("ownReplyAdjustedReplies：留言已補發（published）→ 扣 1，floor 0", () => {
  assert.equal(ownReplyAdjustedReplies(3, "published"), 2);
  assert.equal(ownReplyAdjustedReplies(1, "published"), 0);
  assert.equal(ownReplyAdjustedReplies(0, "published"), 0); // 不會變負
});

test("ownReplyAdjustedReplies：未補發/pending/failed/none/null → 不扣", () => {
  assert.equal(ownReplyAdjustedReplies(3, "pending"), 3);
  assert.equal(ownReplyAdjustedReplies(3, "failed"), 3);
  assert.equal(ownReplyAdjustedReplies(3, "none"), 3);
  assert.equal(ownReplyAdjustedReplies(3, null), 3);
  assert.equal(ownReplyAdjustedReplies(3, undefined), 3);
});

// 2024-01-01 是週一。UTC 01:00 = Asia/Taipei 09:00（+8）。
test("bestPostingTimes：依台北時段分桶並算平均、由高到低排序", () => {
  const r = bestPostingTimes([
    { publishedAt: "2024-01-01T01:00:00Z", views: 100 }, // 台北 週一 09:00
    { publishedAt: "2024-01-08T01:00:00Z", views: 200 }, // 台北 週一 09:00（同桶）
    { publishedAt: "2024-01-02T05:00:00Z", views: 10 } //  台北 週二 13:00
  ]);
  // 09:00 桶平均 150（2 篇）應排在 13:00 桶（10）之前
  assert.equal(r.byHour[0].label, "09:00");
  assert.equal(r.byHour[0].avgViews, 150);
  assert.equal(r.byHour[0].posts, 2);
  assert.equal(r.byHour[1].label, "13:00");

  const mon = r.byWeekday.find((b) => b.label === "週一");
  assert.equal(mon?.avgViews, 150);
  assert.equal(mon?.posts, 2);
});

test("bestPostingTimes：跨日邊界（台北 +8 進到隔天）", () => {
  // UTC 2024-01-01 17:00 = 台北 2024-01-02 01:00（週二 01:00）
  const r = bestPostingTimes([{ publishedAt: "2024-01-01T17:00:00Z", views: 5 }]);
  assert.equal(r.byHour[0].label, "01:00");
  assert.equal(r.byWeekday[0].label, "週二");
});

test("bestPostingTimes：忽略缺時間/壞時間，空輸入回空桶", () => {
  assert.deepEqual(bestPostingTimes([]), { byHour: [], byWeekday: [] });
  const r = bestPostingTimes([
    { publishedAt: null, views: 9 },
    { publishedAt: "not-a-date", views: 9 }
  ]);
  assert.deepEqual(r, { byHour: [], byWeekday: [] });
});

test("insightsHintKind：有發布卻抓不到數據時依 scope 決定提示", () => {
  assert.equal(insightsHintKind({ sampled: 5, fetched: 0 }, true), "reauth");
  assert.equal(insightsHintKind({ sampled: 5, fetched: 0 }, false), "enable_scope");
  assert.equal(insightsHintKind({ sampled: 5, fetched: 2 }, true), null);
  assert.equal(insightsHintKind({ sampled: 0, fetched: 0 }, true), null);
  assert.equal(insightsHintKind(null, true), null);
});
