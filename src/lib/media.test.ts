import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeDraftMedia, normalizeReplyMedia, isQualifiedMediaSet } from "./media";

test("media 陣列優先，過濾無效項", () => {
  const r = normalizeDraftMedia({
    media: [
      { url: "a.jpg", type: "image" },
      { url: "", type: "image" },
      { url: "b.mp4", type: "video" },
      { url: "c", type: "bad" as never }
    ]
  });
  assert.deepEqual(r, [
    { url: "a.jpg", type: "image" },
    { url: "b.mp4", type: "video" }
  ]);
});

test("media 空時退回單一 cloudinary 欄位", () => {
  const r = normalizeDraftMedia({ media: [], cloudinary_media_url: "x.jpg", media_type: "image" });
  assert.deepEqual(r, [{ url: "x.jpg", type: "image" }]);
});

test("無 media 陣列時用單一 source_media_url 後備", () => {
  const r = normalizeDraftMedia({ cloudinary_media_url: null, source_media_url: "s.mp4", media_type: "video" });
  assert.deepEqual(r, [{ url: "s.mp4", type: "video" }]);
});

test("media_type 為 none → 空陣列", () => {
  assert.deepEqual(normalizeDraftMedia({ cloudinary_media_url: "x", media_type: "none" }), []);
});

test("media 陣列存在但全無效時，回退單一 media 欄位", () => {
  const r = normalizeDraftMedia({
    media: [{ url: "", type: "image" }],
    cloudinary_media_url: "fallback.jpg",
    media_type: "image"
  });
  assert.deepEqual(r, [{ url: "fallback.jpg", type: "image" }]);
});

test("全空 → 空陣列", () => {
  assert.deepEqual(normalizeDraftMedia({}), []);
});

test("normalizeReplyMedia：過濾無效項、不退回主文單一欄位", () => {
  assert.deepEqual(
    normalizeReplyMedia({ reply_media: [{ url: "r.jpg", type: "image" }, { url: "", type: "image" }] }),
    [{ url: "r.jpg", type: "image" }]
  );
  // 無 reply_media 不應外溢主文媒體
  assert.deepEqual(normalizeReplyMedia({}), []);
});

test("isQualifiedMediaSet：需 ≥1 影片 + ≥1 圖", () => {
  assert.equal(isQualifiedMediaSet([{ url: "a.mp4", type: "video" }, { url: "b.jpg", type: "image" }]), true);
  assert.equal(isQualifiedMediaSet([{ url: "b.jpg", type: "image" }]), false);
  assert.equal(isQualifiedMediaSet([{ url: "a.mp4", type: "video" }]), false);
  assert.equal(isQualifiedMediaSet([]), false);
});
