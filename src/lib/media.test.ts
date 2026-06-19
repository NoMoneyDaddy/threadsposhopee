import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeDraftMedia } from "./media";

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

test("全空 → 空陣列", () => {
  assert.deepEqual(normalizeDraftMedia({}), []);
});
