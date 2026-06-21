import { test } from "node:test";
import assert from "node:assert/strict";
import { randomShortCode, SHORTCODE_ALPHABET } from "./shortcode";

test("randomShortCode：長度正確、只含字母表字元", () => {
  const code = randomShortCode(7);
  assert.equal(code.length, 7);
  for (const ch of code) assert.ok(SHORTCODE_ALPHABET.includes(ch));
});

test("randomShortCode：注入決定性 pick 可重現", () => {
  assert.equal(randomShortCode(4, () => 0), "2222"); // 字母表第 0 個是 '2'
  assert.equal(randomShortCode(3, () => 1), "333");
});

test("randomShortCode：不含易混淆字元 0/o/1/l/i", () => {
  for (const bad of ["0", "o", "O", "1", "l", "I"]) assert.ok(!SHORTCODE_ALPHABET.includes(bad));
});
