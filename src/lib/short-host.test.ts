import { test } from "node:test";
import assert from "node:assert/strict";
import { shortHostOf, isAllowedOnShortHost } from "./short-host";

test("shortHostOf：從完整網址取 host，壞值/空回空字串", () => {
  assert.equal(shortHostOf("https://go2read.link"), "go2read.link");
  assert.equal(shortHostOf("https://go2read.link/r/x"), "go2read.link");
  assert.equal(shortHostOf(""), "");
  assert.equal(shortHostOf(undefined), "");
  assert.equal(shortHostOf("not a url"), "");
});

test("isAllowedOnShortHost：只放行 /r/* 與 hit beacon", () => {
  assert.equal(isAllowedOnShortHost("/r/abc"), true);
  assert.equal(isAllowedOnShortHost("/api/redirect/hit"), true);
  assert.equal(isAllowedOnShortHost("/"), false);
  assert.equal(isAllowedOnShortHost("/login"), false);
  assert.equal(isAllowedOnShortHost("/drafts"), false);
  assert.equal(isAllowedOnShortHost("/api/redirect"), false); // 建立短連結只在主站
});
