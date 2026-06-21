import { test } from "node:test";
import assert from "node:assert/strict";
import { isPermanentTokenError, ThreadsTokenError } from "./token";

test("isPermanentTokenError：400/401/403 為確定失效", () => {
  assert.equal(isPermanentTokenError(400), true);
  assert.equal(isPermanentTokenError(401), true);
  assert.equal(isPermanentTokenError(403), true);
});

test("isPermanentTokenError：5xx/429/其他為暫時性", () => {
  assert.equal(isPermanentTokenError(429), false); // 限流
  assert.equal(isPermanentTokenError(500), false);
  assert.equal(isPermanentTokenError(503), false);
  assert.equal(isPermanentTokenError(0), false); // 網路/逾時無狀態
  assert.equal(isPermanentTokenError(404), false);
});

test("ThreadsTokenError：保留狀態碼", () => {
  const e = new ThreadsTokenError(401, "boom");
  assert.equal(e.status, 401);
  assert.equal(e.name, "ThreadsTokenError");
  assert.ok(e instanceof Error);
});
