import { test } from "node:test";
import assert from "node:assert/strict";
import { computeStreak, achievementsFor } from "./streak";

test("computeStreak：今天有發 → 從今天起連續計數", () => {
  assert.equal(computeStreak(["2026-06-22", "2026-06-21", "2026-06-20"], "2026-06-22"), 3);
});

test("computeStreak：今天沒發但昨天有 → 仍續（當天未過完）", () => {
  assert.equal(computeStreak(["2026-06-21", "2026-06-20"], "2026-06-22"), 2);
});

test("computeStreak：中斷 → 只算最近一段", () => {
  assert.equal(computeStreak(["2026-06-22", "2026-06-20", "2026-06-19"], "2026-06-22"), 1);
});

test("computeStreak：兩天前才有發（昨天斷）→ 0", () => {
  assert.equal(computeStreak(["2026-06-20"], "2026-06-22"), 0);
});

test("computeStreak：空 → 0；重複日去重", () => {
  assert.equal(computeStreak([], "2026-06-22"), 0);
  assert.equal(computeStreak(["2026-06-22", "2026-06-22"], "2026-06-22"), 1);
});

test("computeStreak：跨月邊界連續", () => {
  assert.equal(computeStreak(["2026-07-01", "2026-06-30", "2026-06-29"], "2026-07-01"), 3);
});

test("achievementsFor：依統計點亮", () => {
  const a = achievementsFor({ published: 12, contribution: 6, streak: 7 });
  const earned = a.filter((x) => x.earned).map((x) => x.key);
  assert.deepEqual(earned, ["first_post", "ten_posts", "streak3", "streak7", "contributor", "high_contrib"]);
});
