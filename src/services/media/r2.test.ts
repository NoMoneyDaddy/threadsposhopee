import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveSigningKey, buildS3PutAuth, r2ValidationReason } from "./r2";

// AWS 官方文件「Examples of how to derive a signing key for Signature Version 4」測試向量：
// secret=wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY, date=20120215, region=us-east-1, service=iam
// 期望簽章金鑰 hex = f4780e2d9f65fa895f9c67b32ce1baf0b0d8a43505a000a1a9e090d414db404d
test("deriveSigningKey：符合 AWS 官方測試向量", () => {
  const key = deriveSigningKey("wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY", "20120215", "us-east-1", "iam");
  assert.equal(key.toString("hex"), "f4780e2d9f65fa895f9c67b32ce1baf0b0d8a43505a000a1a9e090d414db404d");
});

test("buildS3PutAuth：產出穩定且格式正確的 Authorization", () => {
  const a = buildS3PutAuth({
    accessKeyId: "AKIAEXAMPLE",
    secretAccessKey: "secret",
    region: "auto",
    host: "acc.r2.cloudflarestorage.com",
    canonicalPath: "/bucket/threads/images/x.jpg",
    amzDate: "20260622T000000Z",
    contentType: "image/jpeg"
  });
  assert.match(a.authorization, /^AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE\/20260622\/auto\/s3\/aws4_request, /);
  assert.match(a.authorization, /SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, /);
  assert.match(a.authorization, /Signature=[0-9a-f]{64}$/);
});

test("buildS3PutAuth：相同輸入 → 相同簽章（決定性）", () => {
  const args = {
    accessKeyId: "AKIAEXAMPLE",
    secretAccessKey: "secret",
    region: "auto",
    host: "acc.r2.cloudflarestorage.com",
    canonicalPath: "/bucket/a.jpg",
    amzDate: "20260622T010203Z",
    contentType: "image/jpeg"
  };
  assert.equal(buildS3PutAuth(args).authorization, buildS3PutAuth(args).authorization);
});

test("r2ValidationReason：依狀態碼給對應訊息", () => {
  assert.match(r2ValidationReason(403), /金鑰無效或無此 bucket 權限/);
  assert.match(r2ValidationReason(401), /金鑰無效或無此 bucket 權限/);
  assert.match(r2ValidationReason(404), /找不到 bucket/);
  assert.match(r2ValidationReason(500), /HTTP 500/);
});
