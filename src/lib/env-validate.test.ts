import { test } from "node:test";
import assert from "node:assert/strict";
import { validateEnv, type EnvLike } from "./env-validate";

const base: EnvLike = {
  encryptionKey: "",
  vapidPublicKey: "",
  vapidPrivateKey: "",
  aiProvider: "gemini",
  cronSecret: "",
  supabaseServiceKey: ""
};

test("validateEnv：全空（Demo）非生產 → 無警告", () => {
  assert.deepEqual(validateEnv(base, false), []);
});

test("validateEnv：encryptionKey 長度不符 → 警告", () => {
  const ok = Buffer.alloc(32).toString("base64");
  assert.equal(validateEnv({ ...base, encryptionKey: ok }, false).length, 0);
  assert.equal(validateEnv({ ...base, encryptionKey: "too-short" }, false).length, 1);
});

test("validateEnv：VAPID 公私鑰缺一 → 警告", () => {
  assert.equal(validateEnv({ ...base, vapidPublicKey: "pub" }, false).length, 1);
  assert.equal(validateEnv({ ...base, vapidPublicKey: "pub", vapidPrivateKey: "priv" }, false).length, 0);
});

test("validateEnv：AI_PROVIDER 非法 → 警告", () => {
  assert.equal(validateEnv({ ...base, aiProvider: "openai" }, false).length, 1);
  assert.equal(validateEnv({ ...base, aiProvider: "anthropic" }, false).length, 0);
});

test("validateEnv：生產且有 DB 但缺 CRON_SECRET → 警告，非生產不警告", () => {
  assert.equal(validateEnv({ ...base, supabaseServiceKey: "svc" }, true).length, 1);
  assert.equal(validateEnv({ ...base, supabaseServiceKey: "svc" }, false).length, 0);
  assert.equal(validateEnv({ ...base, supabaseServiceKey: "svc", cronSecret: "x" }, true).length, 0);
});
