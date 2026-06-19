import { test } from "node:test";
import assert from "node:assert/strict";
import { gapJitterMinutes, effectiveGapMinutes, planAccountQueue } from "./cadence";

test("抖動穩定且落在 0..max", () => {
  const a = gapJitterMinutes("acc:123", 40);
  const b = gapJitterMinutes("acc:123", 40);
  assert.equal(a, b); // 同 seed 同值
  assert.ok(a >= 0 && a <= 40);
  assert.equal(gapJitterMinutes("acc:123", 0), 0); // jitter 0 → 0
});

test("有效間隔 = 保底 + 抖動", () => {
  const g = effectiveGapMinutes(240, 40, "acc:1");
  assert.ok(g >= 240 && g <= 280);
});

const base = Date.parse("2026-06-19T00:00:00Z");

test("從未發過：第一篇排隊中、可立即發", () => {
  const plan = planAccountQueue({
    drafts: [{ id: "d1", scheduledAt: null }],
    lastPublishedAt: null,
    publishedLast24h: 0,
    floorMin: 240,
    jitterMax: 0,
    dailyCap: 5,
    accountId: "acc",
    now: base
  });
  assert.equal(plan[0].etaIso, new Date(base).toISOString());
  assert.match(plan[0].reason, /排隊中/);
});

test("剛發過：下一篇要等保底間隔", () => {
  const last = new Date(base - 10 * 60000).toISOString(); // 10 分鐘前
  const plan = planAccountQueue({
    drafts: [{ id: "d1", scheduledAt: null }],
    lastPublishedAt: last,
    publishedLast24h: 1,
    floorMin: 240,
    jitterMax: 0,
    dailyCap: 5,
    accountId: "acc",
    now: base
  });
  // eta = last + 240 分
  assert.equal(plan[0].etaIso, new Date(Date.parse(last) + 240 * 60000).toISOString());
  assert.match(plan[0].reason, /間隔等待/);
});

test("上次發文已超過保底間隔 → ETA 為 now，不顯示過去時間", () => {
  const last = new Date(base - 300 * 60000).toISOString(); // 5 小時前，floor=4 小時
  const plan = planAccountQueue({
    drafts: [{ id: "d1", scheduledAt: null }],
    lastPublishedAt: last,
    publishedLast24h: 1,
    floorMin: 240,
    jitterMax: 0,
    dailyCap: 5,
    accountId: "acc",
    now: base
  });
  assert.equal(plan[0].etaIso, new Date(base).toISOString());
  assert.match(plan[0].reason, /排隊中/);
});

test("已達每日上限 → 明天接續", () => {
  const plan = planAccountQueue({
    drafts: [{ id: "d1", scheduledAt: null }],
    lastPublishedAt: new Date(base).toISOString(),
    publishedLast24h: 5,
    floorMin: 240,
    jitterMax: 0,
    dailyCap: 5,
    accountId: "acc",
    now: base
  });
  assert.equal(plan[0].etaIso, new Date(base + 24 * 3600 * 1000).toISOString());
  assert.match(plan[0].reason, /今日已達上限/);
});

test("多篇依間隔依序排開", () => {
  const plan = planAccountQueue({
    drafts: [
      { id: "d1", scheduledAt: null },
      { id: "d2", scheduledAt: null }
    ],
    lastPublishedAt: null,
    publishedLast24h: 0,
    floorMin: 60,
    jitterMax: 0,
    dailyCap: 5,
    accountId: "acc",
    now: base
  });
  assert.equal(plan[0].etaIso, new Date(base).toISOString());
  // 第二篇 = 第一篇 + 60 分
  assert.equal(plan[1].etaIso, new Date(base + 60 * 60000).toISOString());
});

test("排程時間晚於間隔 → 用排程時間", () => {
  const sched = new Date(base + 5 * 3600 * 1000).toISOString();
  const plan = planAccountQueue({
    drafts: [{ id: "d1", scheduledAt: sched }],
    lastPublishedAt: null,
    publishedLast24h: 0,
    floorMin: 60,
    jitterMax: 0,
    dailyCap: 5,
    accountId: "acc",
    now: base
  });
  assert.equal(plan[0].etaIso, sched);
  assert.equal(plan[0].reason, "已排程");
});
