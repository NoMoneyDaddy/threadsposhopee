import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isValidBindToken,
  parseStartPayload,
  createBindToken,
  consumeBindToken,
  cleanupExpiredBindTokens
} from "./telegram-bind";

test("isValidBindToken 只接受 32 位小寫 hex", () => {
  assert.equal(isValidBindToken("a".repeat(32)), true);
  assert.equal(isValidBindToken("0123456789abcdef0123456789abcdef"), true);
  assert.equal(isValidBindToken("A".repeat(32)), false); // 大寫不收
  assert.equal(isValidBindToken("a".repeat(31)), false); // 太短
  assert.equal(isValidBindToken("a".repeat(33)), false); // 太長
  assert.equal(isValidBindToken("xyz"), false);
  assert.equal(isValidBindToken(""), false);
  assert.equal(isValidBindToken("javascript:alert(1)".padEnd(32, "0")), false);
});

test("parseStartPayload 取 /start 後的 payload", () => {
  assert.equal(parseStartPayload("/start abc123"), "abc123");
  assert.equal(parseStartPayload("  /start abc123  "), "abc123");
  assert.equal(parseStartPayload("/start@iwantpo_bot xyz"), "xyz"); // 群組指令帶 @bot
  assert.equal(parseStartPayload("/start"), null); // 無 payload
  assert.equal(parseStartPayload("/start "), null);
  assert.equal(parseStartPayload("hello"), null); // 非 start 指令
  assert.equal(parseStartPayload(""), null);
  assert.equal(parseStartPayload(undefined), null);
  assert.equal(parseStartPayload(null), null);
});

test("parseStartPayload 只取第一段 token（忽略後續空白分隔）", () => {
  assert.equal(parseStartPayload("/start tok1 tok2"), "tok1");
});

// 以下行為測試在 demo 模式（無 Supabase 金鑰）下走記憶體 Map，鎖住一次性消費契約。
test("createBindToken 產出合法 token，consumeBindToken 一次性消費（防重放）", async () => {
  const token = await createBindToken("owner-A");
  assert.equal(isValidBindToken(token), true);
  // 首次消費取得 ownerId
  assert.equal(await consumeBindToken(token), "owner-A");
  // 再次消費（重放）回 null
  assert.equal(await consumeBindToken(token), null);
});

test("consumeBindToken 對格式錯誤的 token 直接回 null（不查庫）", async () => {
  assert.equal(await consumeBindToken("not-a-valid-token"), null);
  assert.equal(await consumeBindToken(""), null);
});

test("cleanupExpiredBindTokens 不刪除未過期的有效綁定碼", async () => {
  const token = await createBindToken("owner-B");
  const { deleted } = await cleanupExpiredBindTokens();
  assert.equal(deleted, 0); // 剛建立、未過期
  // 清理後仍可正常消費
  assert.equal(await consumeBindToken(token), "owner-B");
});
