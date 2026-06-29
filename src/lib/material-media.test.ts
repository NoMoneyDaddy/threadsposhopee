import { test } from "node:test";
import assert from "node:assert/strict";
import { splitMaterialMedia, mergeToMaterialMedia, sanitizeMaterialMedia, sanitizeThreadSegments, applyDefaultSlots } from "./material-media";

test("applyDefaultSlots：第一張圖預設 both、其餘 main", () => {
  const out = applyDefaultSlots([
    { url: "a", type: "image" },
    { url: "b", type: "image" },
    { url: "c", type: "video" }
  ]);
  assert.deepEqual(out, [
    { url: "a", type: "image", slot: "both" },
    { url: "b", type: "image", slot: "main" },
    { url: "c", type: "video", slot: "main" }
  ]);
});

test("applyDefaultSlots：第一個是影片時，第一張圖才標 both", () => {
  const out = applyDefaultSlots([
    { url: "v", type: "video" },
    { url: "i", type: "image" }
  ]);
  assert.equal(out[0].slot, "main");
  assert.equal(out[1].slot, "both");
});

test("applyDefaultSlots：已明確指定 slot 則原樣不覆寫", () => {
  const input = [
    { url: "a", type: "image" as const, slot: "reply" as const },
    { url: "b", type: "image" as const }
  ];
  assert.equal(applyDefaultSlots(input), input);
});

test("applyDefaultSlots：無圖片（純影片）→ 全部 main", () => {
  const out = applyDefaultSlots([{ url: "v", type: "video" }]);
  assert.equal(out[0].slot, "main");
});

test("sanitizeThreadSegments：取 text＋media(去 slot)、丟空段、最多 10 段", () => {
  const r = sanitizeThreadSegments([
    { text: "第三段", media: [{ url: "a.jpg", type: "image", slot: "reply" }] },
    { text: "  ", media: [] }, // 空段 → 丟棄
    { text: 123, media: [{ url: "", type: "image" }] }, // text 非字串→null、media 無效→空 → 整段丟
    { text: null, media: [{ url: "v.mp4", type: "video" }] } // 無文字但有媒體 → 保留
  ]);
  assert.deepEqual(r, [
    { text: "第三段", media: [{ url: "a.jpg", type: "image" }] },
    { text: null, media: [{ url: "v.mp4", type: "video" }] }
  ]);
});

test("sanitizeThreadSegments：非陣列 → 空陣列", () => {
  assert.deepEqual(sanitizeThreadSegments(null), []);
  assert.deepEqual(sanitizeThreadSegments("x"), []);
});

test("sanitizeMaterialMedia：濾無效項、slot 夾 main/reply/both、依 url 去重保序", () => {
  const r = sanitizeMaterialMedia([
    { url: "a", type: "video", slot: "reply" },
    { url: "", type: "image" }, // 無 url → 丟
    { url: "b", type: "gif" }, // 非法 type → 丟
    { url: "c", type: "image" }, // 未設 slot → main
    { url: "d", type: "image", slot: "weird" }, // 非法 slot → main
    { url: "e", type: "image", slot: "both" },
    { url: "a", type: "image" } // 重複 url → 丟
  ]);
  assert.deepEqual(r, [
    { url: "a", type: "video", slot: "reply" },
    { url: "c", type: "image", slot: "main" },
    { url: "d", type: "image", slot: "main" },
    { url: "e", type: "image", slot: "both" }
  ]);
  assert.deepEqual(sanitizeMaterialMedia(null), []);
  assert.deepEqual(sanitizeMaterialMedia("x"), []);
});

test("splitMaterialMedia：依 slot 分主文/留言，both 兩邊都放，未設視同主文", () => {
  const r = splitMaterialMedia([
    { url: "a", type: "video" }, // 未設 → 主文
    { url: "b", type: "image", slot: "main" },
    { url: "c", type: "image", slot: "reply" },
    { url: "d", type: "image", slot: "both" }
  ]);
  assert.deepEqual(r.main, [
    { url: "a", type: "video" },
    { url: "b", type: "image" },
    { url: "d", type: "image" }
  ]);
  assert.deepEqual(r.reply, [
    { url: "c", type: "image" },
    { url: "d", type: "image" }
  ]);
});

test("splitMaterialMedia：過濾無效項、空輸入", () => {
  assert.deepEqual(splitMaterialMedia(null), { main: [], reply: [] });
  const r = splitMaterialMedia([{ url: "", type: "image" }, { url: "x", type: "gif" as never }, { url: "ok", type: "image" }]);
  assert.deepEqual(r.main, [{ url: "ok", type: "image" }]);
});

test("mergeToMaterialMedia：重複（兩邊都有）標 both 且只存一份", () => {
  const merged = mergeToMaterialMedia(
    [{ url: "v1", type: "video" }, { url: "img2", type: "image" }],
    [{ url: "img2", type: "image" }]
  );
  assert.deepEqual(merged, [
    { url: "v1", type: "video", slot: "main" },
    { url: "img2", type: "image", slot: "both" }
  ]);
});

test("mergeToMaterialMedia：留言獨有者標 reply 接在後面；主文重複 url 去重", () => {
  const merged = mergeToMaterialMedia(
    [{ url: "a", type: "image" }, { url: "a", type: "image" }],
    [{ url: "b", type: "image" }]
  );
  assert.deepEqual(merged, [
    { url: "a", type: "image", slot: "main" },
    { url: "b", type: "image", slot: "reply" }
  ]);
});

test("往返一致：merge 後再 split 應還原主文/留言集合", () => {
  const main = [{ url: "v", type: "video" as const }, { url: "i", type: "image" as const }];
  const reply = [{ url: "i", type: "image" as const }, { url: "r", type: "image" as const }];
  const { main: m2, reply: r2 } = splitMaterialMedia(mergeToMaterialMedia(main, reply));
  assert.deepEqual(new Set(m2.map((x) => x.url)), new Set(["v", "i"]));
  assert.deepEqual(new Set(r2.map((x) => x.url)), new Set(["i", "r"]));
});
