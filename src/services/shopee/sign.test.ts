import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { buildShopeeAuth } from "./sign";

test("簽章 = SHA256(appId+timestamp+payload+secret) hex，header 格式逗號不留空格", () => {
  const { timestamp, signature, authorization } = buildShopeeAuth("app123", "secretXYZ", '{"query":"x"}');
  const expected = crypto
    .createHash("sha256")
    .update("app123" + timestamp + '{"query":"x"}' + "secretXYZ")
    .digest("hex");
  assert.equal(signature, expected);
  assert.equal(authorization, `SHA256 Credential=app123,Timestamp=${timestamp},Signature=${signature}`);
  assert.match(authorization, /Credential=app123,Timestamp=\d+,Signature=[0-9a-f]{64}/);
});

test("timestamp 為秒級且接近現在", () => {
  const { timestamp } = buildShopeeAuth("a", "b", "p");
  const now = Math.floor(Date.now() / 1000);
  assert.ok(Math.abs(now - Number(timestamp)) <= 2);
});
