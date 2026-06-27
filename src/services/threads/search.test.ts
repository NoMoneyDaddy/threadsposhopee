import { test } from "node:test";
import assert from "node:assert/strict";
import { parseKeywordSearch, toTitle } from "./search";

test("toTitle：取首句、超長截斷加省略號", () => {
  assert.equal(toTitle("今天天氣很好。明天會下雨。"), "今天天氣很好。");
  assert.equal(toTitle("沒有標點的一段文字"), "沒有標點的一段文字");
  assert.equal(toTitle("a".repeat(80), 60), `${"a".repeat(60)}…`);
});

test("parseKeywordSearch：映射 text/permalink/timestamp，略過缺 text 或 permalink 者", () => {
  const json = {
    data: [
      { id: "1", text: "好用的露營裝備推薦！\n第二行", permalink: "https://www.threads.net/@u/post/1", timestamp: "2026-06-27T00:00:00+0000" },
      { id: "2", text: "沒有連結", timestamp: "2026-06-27T00:00:00+0000" }, // 無 permalink → 略過
      { id: "3", permalink: "https://www.threads.net/@u/post/3" } // 無 text → 略過
    ]
  };
  const items = parseKeywordSearch(json);
  assert.equal(items.length, 1);
  assert.equal(items[0].link, "https://www.threads.net/@u/post/1");
  assert.equal(items[0].title, "好用的露營裝備推薦！"); // 首句（! 為斷句）
  assert.equal(items[0].description, "好用的露營裝備推薦！\n第二行"); // 原文當摘要
  assert.equal(items[0].pubDate, "2026-06-27T00:00:00+0000");
});

test("parseKeywordSearch：非陣列/空輸入回空陣列", () => {
  assert.deepEqual(parseKeywordSearch(null), []);
  assert.deepEqual(parseKeywordSearch({}), []);
  assert.deepEqual(parseKeywordSearch({ data: "x" }), []);
});
