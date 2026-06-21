import { test } from "node:test";
import assert from "node:assert/strict";
import { extractHttpUrls, replaceUrls } from "./linkify";

test("extractHttpUrls：抽出多個、去重、去結尾標點", () => {
  assert.deepEqual(extractHttpUrls("看這 https://a.com/x。還有 https://b.com/y！"), [
    "https://a.com/x",
    "https://b.com/y"
  ]);
  assert.deepEqual(extractHttpUrls("https://a.com 重複 https://a.com"), ["https://a.com"]);
});

test("extractHttpUrls：無連結/空 回空陣列", () => {
  assert.deepEqual(extractHttpUrls("沒有連結"), []);
  assert.deepEqual(extractHttpUrls(null), []);
});

test("replaceUrls：依對照表替換，長 URL 先換避免前綴誤替", () => {
  const text = "A https://a.com B https://a.com/long C";
  const out = replaceUrls(text, {
    "https://a.com": "https://s/1",
    "https://a.com/long": "https://s/2"
  });
  assert.equal(out, "A https://s/1 B https://s/2 C");
});
