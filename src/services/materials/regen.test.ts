import { test } from "node:test";
import assert from "node:assert/strict";
import { subIdsForRegen } from "./regen";

test("subIdsForRegen：還原逗號串的 Open API subId", () => {
  assert.deepEqual(subIdsForRegen("threadspo,acct1,123456"), ["threadspo", "acct1", "123456"]);
});

test("subIdsForRegen：還原 dash 串的 an_redir subId", () => {
  assert.deepEqual(subIdsForRegen("threadspo-acct1-123456"), ["threadspo", "acct1", "123456"]);
});

test("subIdsForRegen：空值＝刻意不帶 subId（回空陣列，不重建）", () => {
  assert.deepEqual(subIdsForRegen(null), []);
  assert.deepEqual(subIdsForRegen(""), []);
});

test("subIdsForRegen：最多 5 段、過濾非英數空段", () => {
  const r = subIdsForRegen("a,b,,c,d,e,f,g");
  assert.equal(r.length, 5);
  assert.deepEqual(r, ["a", "b", "c", "d", "e"]);
});
