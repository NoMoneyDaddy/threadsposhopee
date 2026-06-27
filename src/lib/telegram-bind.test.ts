import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidBindToken, parseStartPayload } from "./telegram-bind";

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
