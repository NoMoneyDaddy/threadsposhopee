import { test } from "node:test";
import assert from "node:assert/strict";
import { checkThreadsContent, countHashtags } from "./threads-content";

test("countHashtags：詞首才算、連結內的 # 不算", () => {
  assert.equal(countHashtags("好物 #優惠 來看"), 1);
  assert.equal(countHashtags("#a #b #c"), 3);
  assert.equal(countHashtags("https://x.tw/p#section 沒有 hashtag"), 0);
  assert.equal(countHashtags("中文#沒空白前綴"), 0);
  assert.equal(countHashtags("#中文標籤 ok"), 1);
});

test("checkThreadsContent：500 字上限（碼位計，含 emoji）", () => {
  const ok = checkThreadsContent("a".repeat(500));
  assert.equal(ok.chars, 500);
  assert.equal(ok.overLimit, false);
  const over = checkThreadsContent("a".repeat(501));
  assert.equal(over.overLimit, true);
  assert.equal(over.ok, false);
  // emoji 以單一碼位計（[...str] 拆碼位）
  assert.equal(checkThreadsContent("👍").chars, 1);
});

test("checkThreadsContent：>1 hashtag 視為不合規", () => {
  const r = checkThreadsContent("超值 #折扣 #限時 #免運");
  assert.equal(r.hashtags, 3);
  assert.equal(r.tooManyHashtags, true);
  assert.equal(r.ok, false);
  const one = checkThreadsContent("超值 #折扣");
  assert.equal(one.ok, true);
});

test("checkThreadsContent：空值安全", () => {
  const r = checkThreadsContent(null);
  assert.deepEqual(r, { chars: 0, overLimit: false, hashtags: 0, tooManyHashtags: false, ok: true });
});
