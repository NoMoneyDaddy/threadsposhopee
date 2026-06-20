import { test } from "node:test";
import assert from "node:assert/strict";
import { listProcessedPostIds } from "./sources-store";
import { demo } from "./demo-store";
import type { Draft } from "./types";

// demo 模式（無 Supabase 金鑰）：listProcessedPostIds 走記憶體過濾，可直接驗證。
test("listProcessedPostIds：只回候選清單中、屬於該來源的已處理貼文 id", async () => {
  const sourceId = "src-lpp-1";
  demo.drafts.push(
    { id: "d1", source_id: sourceId, source_post_id: "p1", status: "draft", created_at: "2026-01-01" } as Draft,
    { id: "d2", source_id: sourceId, source_post_id: "p2", status: "draft", created_at: "2026-01-01" } as Draft,
    { id: "d3", source_id: "other", source_post_id: "p3", status: "draft", created_at: "2026-01-01" } as Draft
  );

  const set = await listProcessedPostIds(sourceId, ["p1", "p3", "p9"]);
  assert.ok(set.has("p1"), "p1 已處理且在候選內 → 命中");
  assert.ok(!set.has("p2"), "p2 不在候選清單 → 不回");
  assert.ok(!set.has("p3"), "p3 屬於其他來源 → 不回");
  assert.ok(!set.has("p9"), "p9 未處理 → 不回");
});

test("listProcessedPostIds：空候選清單回空集合（不查詢）", async () => {
  const set = await listProcessedPostIds("any", []);
  assert.equal(set.size, 0);
});
