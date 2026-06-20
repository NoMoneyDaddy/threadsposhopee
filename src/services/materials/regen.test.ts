import { test } from "node:test";
import assert from "node:assert/strict";
import { subIdsForRegen } from "./regen";

test("subIdsForRegen：還原逗號串的 Open API subId", () => {
  assert.deepEqual(subIdsForRegen("threadspo,acct1,123456", "123456"), ["threadspo", "acct1", "123456"]);
});

test("subIdsForRegen：還原 dash 串的 an_redir subId", () => {
  assert.deepEqual(subIdsForRegen("threadspo-acct1-123456", "123456"), ["threadspo", "acct1", "123456"]);
});

test("subIdsForRegen：空值時用 item_id 重建一組", () => {
  const r = subIdsForRegen(null, "999", "base");
  assert.ok(r.length > 0);
  assert.ok(r.includes("999"));
});

test("subIdsForRegen：最多 5 段、過濾非英數空段", () => {
  const r = subIdsForRegen("a,b,,c,d,e,f,g", "1");
  assert.equal(r.length, 5);
  assert.deepEqual(r, ["a", "b", "c", "d", "e"]);
});
