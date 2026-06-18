import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

// crypto.ts 載入時透過 env 讀 APP_ENCRYPTION_KEY；在動態 import 前設好（避免 top-level await / import 提升問題）
process.env.APP_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
const load = () => import("./crypto");

test("加解密 round-trip 還原原文", async () => {
  const { encrypt, decrypt } = await load();
  const plain = "存進 DB 的 access_token 🔒 abc123";
  const enc = encrypt(plain);
  assert.notEqual(enc, plain);
  assert.equal(enc.split(".").length, 3); // iv.tag.data
  assert.equal(decrypt(enc), plain);
});

test("相同明文每次密文不同（隨機 IV）", async () => {
  const { encrypt, decrypt } = await load();
  const a = encrypt("same");
  const b = encrypt("same");
  assert.notEqual(a, b);
  assert.equal(decrypt(a), "same");
  assert.equal(decrypt(b), "same");
});

test("竄改密文 → GCM 驗證失敗丟錯", async () => {
  const { encrypt, decrypt } = await load();
  const enc = encrypt("tamper-me");
  const [iv, tag] = enc.split(".");
  const forged = [iv, tag, Buffer.from("zzzz").toString("base64")].join(".");
  assert.throws(() => decrypt(forged));
});

test("格式錯誤丟錯", async () => {
  const { decrypt } = await load();
  assert.throws(() => decrypt("only.two"));
});
