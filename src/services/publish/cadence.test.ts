import { test } from "node:test";
import assert from "node:assert/strict";
import { gapJitterMinutes, effectiveGapMinutes, planAccountQueue, shardOf, circuitOpen, nextPacingSkipReason } from "./cadence";

const NOW = Date.parse("2026-06-20T00:00:00Z");
const basePacing = {
  failuresThisRun: 0,
  failureLimit: 0,
  doneThisRun: 0,
  batchPerRun: 1,
  publishedLast24h: 0,
  maxPerDay: 5,
  warmupDays: 0,
  createdAt: null,
  lastPublishedAt: null,
  minGapMinutes: 0,
  gapJitterMinutes: 0,
  accountId: "acc-1",
  now: NOW
};

test("nextPacingSkipReason：全部過關回 null", () => {
  assert.equal(nextPacingSkipReason(basePacing), null);
});

test("nextPacingSkipReason：斷路器最先觸發", () => {
  const r = nextPacingSkipReason({ ...basePacing, failuresThisRun: 3, failureLimit: 3, doneThisRun: 9, batchPerRun: 1 });
  assert.match(r ?? "", /連續失敗 3 次/);
});

test("nextPacingSkipReason：批次上限", () => {
  assert.match(nextPacingSkipReason({ ...basePacing, doneThisRun: 1, batchPerRun: 1 }) ?? "", /批次已達上限/);
});

test("nextPacingSkipReason：每日上限（暖機調降）", () => {
  // 新帳號暖機第 0 天 → cap=ceil(5*1/3)=2；已發 2 → 觸發
  const r = nextPacingSkipReason({
    ...basePacing,
    warmupDays: 3,
    createdAt: new Date(NOW).toISOString(),
    publishedLast24h: 2,
    maxPerDay: 5,
    batchPerRun: 10
  });
  assert.match(r ?? "", /已達每日上限（2）/);
});

test("nextPacingSkipReason：最小間隔未到", () => {
  const r = nextPacingSkipReason({
    ...basePacing,
    batchPerRun: 10,
    maxPerDay: 10,
    lastPublishedAt: new Date(NOW - 10 * 60000).toISOString(), // 10 分前
    minGapMinutes: 240
  });
  assert.match(r ?? "", /未達最小間隔（10\/240 分）/);
});

test("nextPacingSkipReason：間隔已足 → 放行", () => {
  const r = nextPacingSkipReason({
    ...basePacing,
    batchPerRun: 10,
    maxPerDay: 10,
    lastPublishedAt: new Date(NOW - 300 * 60000).toISOString(), // 300 分前
    minGapMinutes: 240
  });
  assert.equal(r, null);
});

test("斷路器：達上限才開路，limit<=0 關閉", () => {
  assert.equal(circuitOpen(0, 3), false);
  assert.equal(circuitOpen(2, 3), false);
  assert.equal(circuitOpen(3, 3), true);
  assert.equal(circuitOpen(5, 3), true);
  assert.equal(circuitOpen(10, 0), false); // 關閉
  assert.equal(circuitOpen(10, -1), false);
  assert.equal(circuitOpen(10, NaN), false); // env 解析失敗防禦
});

test("分片：穩定、落在 0..total-1，total<=1 一律 0", () => {
  assert.equal(shardOf("acc-1", 4), shardOf("acc-1", 4)); // 同帳號穩定同片
  for (const id of ["a", "b", "c", "acc-xyz", "123"]) {
    const s = shardOf(id, 4);
    assert.ok(Number.isInteger(s) && s >= 0 && s < 4);
  }
  assert.equal(shardOf("acc-1", 1), 0);
  assert.equal(shardOf("acc-1", 0), 0);
});

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
