import { test } from "node:test";
import assert from "node:assert/strict";
import { isAllowedThreadsActor, THREADS_ACTORS } from "./apify-actors";

test("isAllowedThreadsActor：只放行新/舊兩個已知 actor", () => {
  assert.equal(isAllowedThreadsActor(THREADS_ACTORS.default), true);
  assert.equal(isAllowedThreadsActor(THREADS_ACTORS.legacy), true);
  assert.equal(isAllowedThreadsActor("someone/evil-actor"), false);
  assert.equal(isAllowedThreadsActor(""), false);
});
