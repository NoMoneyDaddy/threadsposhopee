import { test } from "node:test";
import assert from "node:assert/strict";
import { inShard } from "./queue";

test("無分片：一律納入", () => {
  assert.equal(inShard("acc-1"), true);
  assert.equal(inShard(null), true);
});

test("分片：每個帳號恰好落在一片", () => {
  const total = 4;
  for (const id of ["a", "b", "acc-xyz", "123", "kings_man"]) {
    const hits = [0, 1, 2, 3].filter((i) => inShard(id, { index: i, total }));
    assert.equal(hits.length, 1); // 不重不漏
  }
});

test("未綁帳號的草稿只歸片 0", () => {
  assert.equal(inShard(null, { index: 0, total: 3 }), true);
  assert.equal(inShard(null, { index: 1, total: 3 }), false);
  assert.equal(inShard(undefined, { index: 2, total: 3 }), false);
});
