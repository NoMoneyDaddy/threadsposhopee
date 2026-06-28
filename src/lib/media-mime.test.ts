import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyMediaMime, checkUploadFile, MAX_IMAGE_MB, MAX_VIDEO_MB } from "./media-mime";

test("classifyMediaMime 只放行白名單圖片/影片", () => {
  assert.equal(classifyMediaMime("image/jpeg"), "image");
  assert.equal(classifyMediaMime("image/png"), "image");
  assert.equal(classifyMediaMime("video/mp4"), "video");
  assert.equal(classifyMediaMime("video/quicktime"), "video");
  // 非媒體或未知型別一律 null（不臆測）
  assert.equal(classifyMediaMime("application/pdf"), null);
  assert.equal(classifyMediaMime("text/plain"), null);
  assert.equal(classifyMediaMime(""), null);
  assert.equal(classifyMediaMime("image/svg+xml"), null);
});

test("checkUploadFile 通過時回 type", () => {
  assert.deepEqual(checkUploadFile("image/png", 1024, "a.png"), { type: "image" });
  assert.deepEqual(checkUploadFile("video/mp4", 1024, "a.mp4"), { type: "video" });
});

test("checkUploadFile 拒絕不支援型別（code=unsupported_type）", () => {
  const r = checkUploadFile("application/pdf", 10, "a.pdf");
  assert.ok("error" in r && /不支援/.test(r.error));
  assert.equal("error" in r && r.code, "unsupported_type");
});

test("checkUploadFile 拒絕過大檔案（依型別套不同上限，code=too_large）", () => {
  const img = checkUploadFile("image/jpeg", MAX_IMAGE_MB * 1024 * 1024 + 1, "big.jpg");
  assert.ok("error" in img && /過大/.test(img.error));
  assert.equal("error" in img && img.code, "too_large");
  // 圖片上限以下、但超過時用影片上限應通過（驗證上限依型別切換）
  assert.deepEqual(checkUploadFile("video/mp4", MAX_IMAGE_MB * 1024 * 1024 + 1, "v.mp4"), { type: "video" });
  const vid = checkUploadFile("video/mp4", MAX_VIDEO_MB * 1024 * 1024 + 1, "big.mp4");
  assert.ok("error" in vid && /過大/.test(vid.error));
  assert.equal("error" in vid && vid.code, "too_large");
});
