import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSearchPosts } from "./threads";

test("parseSearchPosts：從 postUrl 取貼文 id、抽蝦皮短連結、標記 isReply", () => {
  const posts = parseSearchPosts([
    {
      username: "double_corn2025",
      isReply: true,
      captionText: "泰國小老板海苔棒棒捲\nhttps://s.shopee.tw/4VacwWMMCr",
      postUrl: "https://www.threads.com/@double_corn2025/post/DZ4z2xxmZkj"
    }
  ]);
  assert.equal(posts.length, 1);
  assert.deepEqual(posts[0], {
    postId: "DZ4z2xxmZkj",
    username: "double_corn2025",
    isReply: true,
    text: "泰國小老板海苔棒棒捲\nhttps://s.shopee.tw/4VacwWMMCr",
    mediaType: "none",
    mediaUrl: null,
    shopeeLinks: ["https://s.shopee.tw/4VacwWMMCr"]
  });
});

test("parseSearchPosts：取主要媒體（影片優先於圖）", () => {
  const v = parseSearchPosts([
    { captionText: "x", postUrl: "https://www.threads.com/@u/post/A", imageUrl: "cover.jpg", videoUrl: "clip.mp4" }
  ]);
  assert.equal(v[0].mediaType, "video");
  assert.equal(v[0].mediaUrl, "clip.mp4");

  const img = parseSearchPosts([
    { captionText: "x", postUrl: "https://www.threads.com/@u/post/B", imageUrl: "", allImages: ["full.jpg", "p480.jpg"] }
  ]);
  assert.equal(img[0].mediaType, "image");
  assert.equal(img[0].mediaUrl, "full.jpg");
});

test("parseSearchPosts：沒有 postUrl 的項目略過", () => {
  assert.equal(parseSearchPosts([{ captionText: "嗨", postUrl: "" }]).length, 0);
});

test("parseSearchPosts：無蝦皮連結 → shopeeLinks 空陣列", () => {
  const posts = parseSearchPosts([
    { username: "u", captionText: "純文字", postUrl: "https://www.threads.com/@u/post/ABC" }
  ]);
  assert.deepEqual(posts[0].shopeeLinks, []);
});

test("parseSearchPosts：非陣列輸入回空陣列", () => {
  assert.deepEqual(parseSearchPosts(null as any), []);
});

test("parseSearchPosts：相鄰配對——帶連結的回覆借用前一篇主文媒體", () => {
  const posts = parseSearchPosts([
    // 主文：有圖、無連結（吸睛貼文）
    {
      username: "tdc",
      isReply: false,
      captionText: "哈哈 我真的會笑死",
      postUrl: "https://www.threads.com/@tdc/post/MAIN",
      imageUrl: "main.jpg"
    },
    // 2/2 回覆：帶蝦皮連結、自身無媒體 → 應借用主文的圖
    {
      username: "tdc",
      isReply: true,
      captionText: "這裡有⬇️ https://s.shopee.tw/8pj1gqNBHQ",
      postUrl: "https://www.threads.com/@tdc/post/REPLY"
    }
  ]);
  const reply = posts.find((p) => p.postId === "REPLY")!;
  assert.equal(reply.mediaType, "image");
  assert.equal(reply.mediaUrl, "main.jpg");
});

test("parseSearchPosts：不同作者不互相借用媒體", () => {
  const posts = parseSearchPosts([
    { username: "a", isReply: false, captionText: "圖", postUrl: "https://www.threads.com/@a/post/A", imageUrl: "a.jpg" },
    { username: "b", isReply: true, captionText: "https://s.shopee.tw/xyz", postUrl: "https://www.threads.com/@b/post/B" }
  ]);
  const b = posts.find((p) => p.postId === "B")!;
  assert.equal(b.mediaType, "none");
});
