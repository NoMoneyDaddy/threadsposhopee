import { test } from "node:test";
import assert from "node:assert/strict";
import { detectReachDrop } from "./reach";

// 用相對天數造時間（新→舊不限順序，函式內部自己排）
const day = (n: number) => new Date(Date.now() - n * 86400_000).toISOString();

test("樣本不足 → 不示警", () => {
  const posts = [
    { publishedAt: day(1), views: 100 },
    { publishedAt: day(2), views: 90 }
  ];
  const r = detectReachDrop(posts);
  assert.equal(r.hasSignal, false);
  assert.equal(r.recentN, 0);
});

test("近期觀看驟降到基準一半以下 → 示警", () => {
  const posts = [
    // 近期 3 篇：低
    { publishedAt: day(0), views: 30 },
    { publishedAt: day(1), views: 20 },
    { publishedAt: day(2), views: 40 },
    // 基準 3 篇：高
    { publishedAt: day(5), views: 200 },
    { publishedAt: day(6), views: 180 },
    { publishedAt: day(7), views: 220 }
  ];
  const r = detectReachDrop(posts);
  assert.equal(r.hasSignal, true);
  assert.equal(r.recentMedian, 30);
  assert.equal(r.baselineMedian, 200);
  assert.ok(r.ratio < 0.5);
});

test("觸及穩定 → 不示警", () => {
  const posts = Array.from({ length: 8 }, (_, i) => ({ publishedAt: day(i), views: 100 + i }));
  const r = detectReachDrop(posts);
  assert.equal(r.hasSignal, false);
  assert.ok(r.ratio >= 0.5);
});

test("基準中位為 0（早期都沒觀看）→ 不示警，避免除以零誤判", () => {
  const posts = [
    { publishedAt: day(0), views: 5 },
    { publishedAt: day(1), views: 8 },
    { publishedAt: day(2), views: 3 },
    { publishedAt: day(5), views: 0 },
    { publishedAt: day(6), views: 0 },
    { publishedAt: day(7), views: 0 }
  ];
  const r = detectReachDrop(posts);
  assert.equal(r.hasSignal, false);
  assert.equal(r.ratio, 1);
});

test("缺 publishedAt 的貼文被忽略，不足樣本即不示警", () => {
  const posts = [
    { publishedAt: null, views: 10 },
    { publishedAt: day(1), views: 20 },
    { publishedAt: day(2), views: 30 }
  ];
  const r = detectReachDrop(posts);
  assert.equal(r.hasSignal, false);
});

test("單一爆文不應掩蓋整體驟降（中位數穩健）", () => {
  const posts = [
    { publishedAt: day(0), views: 10 },
    { publishedAt: day(1), views: 5000 }, // 爆文離群值
    { publishedAt: day(2), views: 15 },
    { publishedAt: day(5), views: 300 },
    { publishedAt: day(6), views: 280 },
    { publishedAt: day(7), views: 320 }
  ];
  const r = detectReachDrop(posts);
  // 近期中位 = 15（10,15,5000 排序取中），基準中位 = 300 → 仍示警
  assert.equal(r.recentMedian, 15);
  assert.equal(r.baselineMedian, 300);
  assert.equal(r.hasSignal, true);
});
