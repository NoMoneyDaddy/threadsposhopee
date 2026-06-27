import { test } from "node:test";
import assert from "node:assert/strict";
import { threadsScopeEnabled } from "./oauth";

// 預設（未設 THREADS_SCOPES）的範圍判斷：含預設清單內的 scope、不含未知 scope。
test("threadsScopeEnabled：預設清單命中/未命中", () => {
  assert.equal(threadsScopeEnabled("threads_basic"), true);
  assert.equal(threadsScopeEnabled("threads_content_publish"), true);
  assert.equal(threadsScopeEnabled("threads_manage_insights"), true);
  assert.equal(threadsScopeEnabled("threads_keyword_search"), true);
  assert.equal(threadsScopeEnabled("nope"), false);
  assert.equal(threadsScopeEnabled(""), false);
});
