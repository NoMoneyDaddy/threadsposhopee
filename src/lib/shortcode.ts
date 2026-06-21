import { randomInt } from "node:crypto";

// 短碼字母表：去掉易混淆字元（0/o/O、1/l/I），降低使用者抄錯機率。
export const SHORTCODE_ALPHABET = "23456789abcdefghijkmnpqrstuvwxyz";

// 產生隨機短碼。pick(n) 回傳 0..n-1（預設用 crypto.randomInt，測試可注入決定性函式）。
export function randomShortCode(len = 7, pick: (n: number) => number = randomInt): string {
  let s = "";
  for (let i = 0; i < len; i++) s += SHORTCODE_ALPHABET[pick(SHORTCODE_ALPHABET.length)];
  return s;
}
