import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOgTags } from "./preview";

const BASE = "https://news.example.com/article";

test("parseOgTags：抓 og:title/og:image/og:description（含實體還原）", () => {
  const html = `<html><head>
    <meta property="og:title" content="今日科技 &amp; 要聞">
    <meta property="og:description" content="重點摘要">
    <meta property="og:image" content="https://cdn.example.com/a.jpg">
  </head></html>`;
  const r = parseOgTags(html, BASE);
  assert.equal(r.title, "今日科技 & 要聞");
  assert.equal(r.description, "重點摘要");
  assert.equal(r.imageUrl, "https://cdn.example.com/a.jpg");
});

test("parseOgTags：相對 og:image 還原成絕對網址", () => {
  const r = parseOgTags(`<meta property="og:image" content="/img/cover.png">`, BASE);
  assert.equal(r.imageUrl, "https://news.example.com/img/cover.png");
});

test("parseOgTags：content 在 property 之前也能解析", () => {
  const r = parseOgTags(`<meta content="標題在前" property="og:title">`, BASE);
  assert.equal(r.title, "標題在前");
});

test("parseOgTags：無 og 時退回 <title>", () => {
  const r = parseOgTags(`<html><head><title>純標題</title></head></html>`, BASE);
  assert.equal(r.title, "純標題");
  assert.equal(r.imageUrl, null);
});

test("parseOgTags：什麼都沒有 → 全 null", () => {
  const r = parseOgTags(`<html><body>no meta</body></html>`, BASE);
  assert.deepEqual(r, { title: null, imageUrl: null, description: null });
});

test("parseOgTags：content 值內含另一種引號不被截斷", () => {
  const r = parseOgTags(`<meta property="og:title" content="Bob's post">`, BASE);
  assert.equal(r.title, "Bob's post");
});

test("parseOgTags：twitter:image 作為退路", () => {
  const r = parseOgTags(`<meta name="twitter:image" content="https://cdn.example.com/t.jpg">`, BASE);
  assert.equal(r.imageUrl, "https://cdn.example.com/t.jpg");
});
