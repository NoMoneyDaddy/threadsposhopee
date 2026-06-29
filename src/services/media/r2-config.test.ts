import { test } from "node:test";
import assert from "node:assert/strict";
import { parseR2Input } from "./r2-config";

test("parseR2Input：空 accountId → 清除", () => {
  const r = parseR2Input({ accountId: "" });
  assert.deepEqual(r, { ok: true, accountId: null, bucket: null, publicBase: null });
});

test("parseR2Input：擋掉 S3 API 端點當公開讀網域（會 403）", () => {
  const r = parseR2Input({
    accountId: "abc123def456abc123def456abc12345",
    bucket: "my-media",
    publicBase: "https://8e09874034c7189ce32cc9d478f09127.r2.cloudflarestorage.com"
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /S3 API 端點/);
});

test("parseR2Input：合法輸入 → 正規化 publicBase（去尾斜線）", () => {
  const r = parseR2Input({
    accountId: "abc123def456abc123def456abc12345",
    bucket: "my-media",
    publicBase: "https://media.example.com/"
  });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.publicBase, "https://media.example.com");
    assert.equal(r.bucket, "my-media");
  }
});

test("parseR2Input：非 https 公開網域 → 拒絕", () => {
  const r = parseR2Input({ accountId: "abc123def456abc123def456abc12345", bucket: "b", publicBase: "http://x.com" });
  assert.equal(r.ok, false);
});

test("parseR2Input：缺 bucket / 非法 bucket → 拒絕", () => {
  assert.equal(parseR2Input({ accountId: "abc123def456abc123def456abc12345", publicBase: "https://x.com" }).ok, false);
  assert.equal(
    parseR2Input({ accountId: "abc123def456abc123def456abc12345", bucket: "AB", publicBase: "https://x.com" }).ok,
    false
  );
});

test("parseR2Input：型別錯誤 accountId → 拒絕", () => {
  assert.equal(parseR2Input({ accountId: 123 }).ok, false);
});
