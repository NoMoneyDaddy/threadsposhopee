import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSearchPosts, extractShopeeLinks } from "./threads";

test("extractShopeeLinks：短碼含 - 或 _ 不被截斷（修舊 [a-zA-Z0-9]+ bug）", () => {
  assert.deepEqual(extractShopeeLinks("看這 https://s.shopee.tw/AKL_xQ-abc 喔"), ["https://s.shopee.tw/AKL_xQ-abc"]);
});

test("extractShopeeLinks：shp.ee 短網域也要抓到", () => {
  assert.deepEqual(extractShopeeLinks("限時 https://shp.ee/abc123 衝"), ["https://shp.ee/abc123"]);
});

test("extractShopeeLinks：www. 與 m. 子網域的完整商品網址也要抓到", () => {
  assert.deepEqual(extractShopeeLinks("https://www.shopee.tw/某商品-i.222.333?x=1"), ["https://www.shopee.tw/某商品-i.222.333?x=1"]);
  assert.deepEqual(extractShopeeLinks("手機版 https://m.shopee.tw/product/123/456"), ["https://m.shopee.tw/product/123/456"]);
});

test("extractShopeeLinks：shope.ee 與 s.shopee.tw 仍正常；同連結去重保序", () => {
  assert.deepEqual(
    extractShopeeLinks("A https://shope.ee/30abc B https://s.shopee.tw/4Vac C https://shope.ee/30abc"),
    ["https://shope.ee/30abc", "https://s.shopee.tw/4Vac"]
  );
});

test("extractShopeeLinks：無連結／空字串 → 空陣列", () => {
  assert.deepEqual(extractShopeeLinks("純文字無連結"), []);
  assert.deepEqual(extractShopeeLinks(""), []);
});

test("extractShopeeLinks：修剪句尾全形／半形標點（標點後有空白或在結尾）", () => {
  // 註：標點後若「緊接」中文（無空白）無法可靠切分——蝦皮商品 slug 本身就含中文，
  // 排除中文會誤傷合法連結；故僅處理「標點在邊界（空白前／字串尾）」這個常見情形。
  assert.deepEqual(extractShopeeLinks("買這個 https://www.shopee.tw/product/1/2， 好用"), ["https://www.shopee.tw/product/1/2"]);
  assert.deepEqual(extractShopeeLinks("連結 https://shopee.tw/某商品-i.222.333。"), ["https://shopee.tw/某商品-i.222.333"]);
});

test("extractShopeeLinks：非字串輸入（爬蟲 dataset 異常）→ 空陣列，不拋", () => {
  assert.deepEqual(extractShopeeLinks(null as any), []);
  assert.deepEqual(extractShopeeLinks(undefined as any), []);
  assert.deepEqual(extractShopeeLinks(123 as any), []);
  assert.deepEqual(extractShopeeLinks({} as any), []);
});

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
    media: [],
    mediaType: "none",
    mediaUrl: null,
    shopeeLinks: ["https://s.shopee.tw/4VacwWMMCr"]
  });
});

test("parseSearchPosts：收集去重媒體（影片在前，同圖多尺寸去重）", () => {
  const v = parseSearchPosts([
    {
      captionText: "x",
      postUrl: "https://www.threads.com/@u/post/A",
      imageUrl: "https://c/v/t51/713685048_111_222_n.jpg?stp=e15_tt6",
      videoUrl: "clip.mp4",
      allImages: [
        "https://c/v/t51/713685048_111_222_n.jpg?stp=p480x480", // 同一張圖不同尺寸 → 去重
        "https://c/v/t51/999999999_333_444_n.jpg?stp=e15_tt6" // 不同圖 → 保留
      ]
    }
  ]);
  // 影片在前，圖去重後 2 張 → 共 3 個媒體
  assert.deepEqual(v[0].media, [
    { url: "clip.mp4", type: "video" },
    { url: "https://c/v/t51/713685048_111_222_n.jpg?stp=e15_tt6", type: "image" },
    { url: "https://c/v/t51/999999999_333_444_n.jpg?stp=e15_tt6", type: "image" }
  ]);
  assert.equal(v[0].mediaType, "video");
  assert.equal(v[0].mediaUrl, "clip.mp4");
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
