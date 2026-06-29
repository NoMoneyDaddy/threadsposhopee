import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveSigningKey, buildS3PutAuth, buildS3HeadAuth, r2ValidationReason, isR2AuthFailureStatus } from "./r2";

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

test("isR2AuthFailureStatus：只有 401/403/404 視為明確被拒（其餘放行存檔）", () => {
  for (const s of [401, 403, 404]) assert.equal(isR2AuthFailureStatus(s), true);
  for (const s of [200, 400, 429, 500, 503]) assert.equal(isR2AuthFailureStatus(s), false);
  assert.equal(isR2AuthFailureStatus(undefined), false); // 網路/逾時 → 無 status → 放行
});

test("buildS3HeadAuth：HeadBucket 簽章格式正確（HEAD 不簽 content-type）", () => {
  const a = buildS3HeadAuth({
    accessKeyId: "AKIAEXAMPLE",
    secretAccessKey: "secret",
    region: "auto",
    host: "acc.r2.cloudflarestorage.com",
    canonicalPath: "/my-bucket",
    amzDate: "20260622T000000Z"
  });
  assert.match(a.authorization, /^AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE\/20260622\/auto\/s3\/aws4_request, /);
  assert.equal(a.signedHeaders, "host;x-amz-content-sha256;x-amz-date"); // 無 content-type
  assert.match(a.authorization, /SignedHeaders=host;x-amz-content-sha256;x-amz-date, /);
  assert.match(a.authorization, /Signature=[0-9a-f]{64}$/);
});

test("buildS3HeadAuth：相同輸入 → 相同簽章；PUT 與 HEAD 簽章不同", () => {
  const args = {
    accessKeyId: "AKIAEXAMPLE",
    secretAccessKey: "secret",
    region: "auto",
    host: "acc.r2.cloudflarestorage.com",
    canonicalPath: "/my-bucket",
    amzDate: "20260622T010203Z"
  };
  assert.equal(buildS3HeadAuth(args).authorization, buildS3HeadAuth(args).authorization);
  const put = buildS3PutAuth({ ...args, contentType: "image/jpeg" });
  assert.notEqual(buildS3HeadAuth(args).authorization, put.authorization);
});
