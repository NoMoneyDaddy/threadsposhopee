import { test } from "node:test";
import assert from "node:assert/strict";
import { AI_DOMAINS, getAiDomain, googleNewsRss, defaultFeedsForDomain } from "./ai-domains";

test("AI_DOMAINS：含時事/八卦/明星等領域、id 唯一", () => {
  const ids = AI_DOMAINS.map((d) => d.id);
  for (const want of ["news", "gossip", "celebrity", "tech", "ai", "health"]) assert.ok(ids.includes(want));
  assert.equal(new Set(ids).size, ids.length); // id 唯一
});

test("googleNewsRss：組出繁中台灣查詢、query 編碼", () => {
  const url = googleNewsRss("科技 3C");
  assert.match(url, /^https:\/\/news\.google\.com\/rss\/search\?q=/);
  assert.match(url, /hl=zh-TW/);
  assert.ok(url.includes(encodeURIComponent("科技 3C")));
});

test("defaultFeedsForDomain：已知領域回一個 feed、未知回空", () => {
  assert.equal(defaultFeedsForDomain("tech").length, 1);
  assert.deepEqual(defaultFeedsForDomain("nope"), []);
  assert.ok(getAiDomain("gossip")?.sensitive);
});
