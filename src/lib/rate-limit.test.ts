import { test } from "node:test";
import assert from "node:assert/strict";
import { clientIp } from "./rate-limit";

const mk = (headers: Record<string, string>) => new Request("https://x/api", { headers });

test("clientIp：取 x-forwarded-for 第一跳", () => {
  assert.equal(clientIp(mk({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" })), "1.2.3.4");
  assert.equal(clientIp(mk({ "x-forwarded-for": "  9.9.9.9  " })), "9.9.9.9");
});

test("clientIp：退回 x-real-ip、再退回 unknown", () => {
  assert.equal(clientIp(mk({ "x-real-ip": "8.8.8.8" })), "8.8.8.8");
  assert.equal(clientIp(mk({})), "unknown");
});
