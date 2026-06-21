import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRss } from "./rss";

const sample = `<?xml version="1.0"?><rss><channel>
  <item>
    <title><![CDATA[蘋果發表新款 AI 晶片]]></title>
    <link>https://news.google.com/rss/articles/abc</link>
    <description>&lt;p&gt;這是&lt;b&gt;摘要&lt;/b&gt;內容&lt;/p&gt;</description>
    <pubDate>Mon, 23 Jun 2026 08:00:00 GMT</pubDate>
  </item>
  <item>
    <title>沒有連結的項目</title>
  </item>
</channel></rss>`;

test("parseRss：取出 title/link/description/pubDate，去 CDATA 與 HTML", () => {
  const items = parseRss(sample);
  assert.equal(items.length, 1); // 第二項缺 link 被跳過
  assert.equal(items[0].title, "蘋果發表新款 AI 晶片");
  assert.equal(items[0].link, "https://news.google.com/rss/articles/abc");
  assert.equal(items[0].description, "這是摘要內容");
  assert.equal(items[0].pubDate, "Mon, 23 Jun 2026 08:00:00 GMT");
});

test("parseRss：無 item 回空陣列", () => {
  assert.deepEqual(parseRss("<rss></rss>"), []);
});
