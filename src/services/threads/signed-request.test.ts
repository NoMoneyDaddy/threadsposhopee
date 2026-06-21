import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { parseSignedRequest } from "./signed-request";

const b64url = (buf: Buffer) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function sign(payloadObj: object, secret: string) {
  const payload = b64url(Buffer.from(JSON.stringify(payloadObj)));
  const sig = b64url(createHmac("sha256", secret).update(payload).digest());
  return `${sig}.${payload}`;
}

test("parseSignedRequest: 有效簽章可解析出 payload", () => {
  const signed = sign({ user_id: "123", algorithm: "HMAC-SHA256" }, "s3cret");
  assert.deepEqual(parseSignedRequest(signed, "s3cret"), { user_id: "123", algorithm: "HMAC-SHA256" });
});

test("parseSignedRequest: 簽章用錯密鑰回 null", () => {
  const signed = sign({ user_id: "123" }, "s3cret");
  assert.equal(parseSignedRequest(signed, "wrong"), null);
});

test("parseSignedRequest: 格式錯誤回 null", () => {
  assert.equal(parseSignedRequest("nodot", "s3cret"), null);
  assert.equal(parseSignedRequest("", "s3cret"), null);
  assert.equal(parseSignedRequest(".onlypayload", "s3cret"), null);
});
