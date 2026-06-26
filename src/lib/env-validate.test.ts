import { test } from "node:test";
import assert from "node:assert/strict";
import { validateEnv, type EnvLike } from "./env-validate";

const base: EnvLike = {
  encryptionKey: "",
  vapidPublicKey: "",
  vapidPrivateKey: "",
  aiProvider: "gemini",
  cronSecret: "",
  supabaseUrl: "",
  supabaseServiceKey: "",
  telegramBotToken: "",
  telegramWebhookSecret: ""
};

test("validateEnv：設了 Telegram bot 卻缺 webhook secret → 警告", () => {
  assert.equal(validateEnv({ ...base, telegramBotToken: "x" }, false).length, 1);
  assert.equal(validateEnv({ ...base, telegramBotToken: "x", telegramWebhookSecret: "s" }, false).length, 0);
});

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

test("validateEnv：AI_PROVIDER 非法 → 警告（空值不驗）", () => {
  assert.equal(validateEnv({ ...base, aiProvider: "" }, false).length, 0);
  assert.equal(validateEnv({ ...base, aiProvider: "openai" }, false).length, 1);
  assert.equal(validateEnv({ ...base, aiProvider: "anthropic" }, false).length, 0);
});

test("validateEnv：生產且 URL+serviceKey 齊全但缺 CRON_SECRET → 警告", () => {
  const db = { supabaseUrl: "https://x.supabase.co", supabaseServiceKey: "svc" };
  assert.equal(validateEnv({ ...base, ...db }, true).length, 1);
  assert.equal(validateEnv({ ...base, ...db }, false).length, 0); // 非生產不警告
  assert.equal(validateEnv({ ...base, ...db, cronSecret: "x" }, true).length, 0);
  // 只有 serviceKey 沒 URL（DB 未真正設定）→ 不誤報
  assert.equal(validateEnv({ ...base, supabaseServiceKey: "svc" }, true).length, 0);
});
