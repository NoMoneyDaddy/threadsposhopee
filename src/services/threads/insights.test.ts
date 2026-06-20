import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePostInsights } from "./insights";

test("parsePostInsights：媒體格式 values[0].value", () => {
  const r = parsePostInsights({
    data: [
      { name: "views", values: [{ value: 1200 }] },
      { name: "likes", values: [{ value: 100 }] },
      { name: "replies", values: [{ value: 10 }] }
    ]
  });
  assert.equal(r.views, 1200);
  assert.equal(r.likes, 100);
  assert.equal(r.replies, 10);
  assert.equal(r.reposts, 0); // 缺漏者補 0
});

test("parsePostInsights：也吃 total_value.value", () => {
  const r = parsePostInsights({ data: [{ name: "shares", total_value: { value: 7 } }] });
  assert.equal(r.shares, 7);
});

test("parsePostInsights：壞輸入回全 0、忽略未知 metric", () => {
  assert.deepEqual(parsePostInsights(null), { views: 0, likes: 0, replies: 0, reposts: 0, quotes: 0, shares: 0 });
  assert.deepEqual(parsePostInsights({ data: "nope" }), { views: 0, likes: 0, replies: 0, reposts: 0, quotes: 0, shares: 0 });
  const r = parsePostInsights({ data: [{ name: "bogus", values: [{ value: 5 }] }, { name: "likes", values: [{ value: 3 }] }] });
  assert.equal(r.likes, 3);
});
