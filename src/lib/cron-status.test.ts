import { test } from "node:test";
import assert from "node:assert/strict";
import { cronHeartbeatStatus } from "./cron-status";

const NOW = Date.parse("2026-06-27T12:00:00.000Z");

test("cronHeartbeatStatus：無心跳 → 未開啟", () => {
  const s = cronHeartbeatStatus(null, NOW);
  assert.equal(s.tone, "text-ink-3");
  assert.match(s.text, /未開啟/);
});

test("cronHeartbeatStatus：非法時間戳 → 格式無效警告（不誤判運轉中）", () => {
  const s = cronHeartbeatStatus("not-a-date", NOW);
  assert.equal(s.tone, "text-amber-600");
  assert.match(s.text, /格式無效/);
});

test("cronHeartbeatStatus：未來時間 → 警告", () => {
  const s = cronHeartbeatStatus(new Date(NOW + 60_000).toISOString(), NOW);
  assert.equal(s.tone, "text-amber-600");
  assert.match(s.text, /未來/);
});

test("cronHeartbeatStatus：30 分鐘內 → 運轉中（green）", () => {
  const s = cronHeartbeatStatus(new Date(NOW - 5 * 60_000).toISOString(), NOW);
  assert.equal(s.tone, "text-green-600");
  assert.match(s.text, /運轉中/);
  assert.match(s.text, /5 分鐘前/);
});

test("cronHeartbeatStatus：剛好超過 30 分鐘 → 停擺（amber，不被 round 誤判）", () => {
  const s = cronHeartbeatStatus(new Date(NOW - (30 * 60_000 + 1000)).toISOString(), NOW);
  assert.equal(s.tone, "text-amber-600");
  assert.match(s.text, /似乎停了/);
});

test("cronHeartbeatStatus：跨小時格式與『剛剛』", () => {
  assert.match(cronHeartbeatStatus(new Date(NOW - 30_000).toISOString(), NOW).text, /剛剛/);
  assert.match(cronHeartbeatStatus(new Date(NOW - 2 * 3600_000).toISOString(), NOW).text, /2 小時前/);
});
