import { test } from "node:test";
import assert from "node:assert/strict";
import { cloudinaryThumb } from "./img";

test("cloudinaryThumb：插入 transform（含版本段）", () => {
  assert.equal(
    cloudinaryThumb("https://res.cloudinary.com/demo/image/upload/v123/threads/a.jpg", 400),
    "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_400/v123/threads/a.jpg"
  );
});

test("cloudinaryThumb：無版本段也可", () => {
  assert.equal(
    cloudinaryThumb("https://res.cloudinary.com/demo/image/upload/folder/a.jpg", 128),
    "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_128/folder/a.jpg"
  );
});

test("cloudinaryThumb：已有 transform 不重複插入", () => {
  const u = "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_400/v1/a.jpg";
  assert.equal(cloudinaryThumb(u, 200), u);
});

test("cloudinaryThumb：非 Cloudinary URL 原樣返回", () => {
  const u = "https://scontent.cdninstagram.com/v/a.jpg";
  assert.equal(cloudinaryThumb(u, 400), u);
});

test("cloudinaryThumb：空值回空字串", () => {
  assert.equal(cloudinaryThumb(null, 400), "");
  assert.equal(cloudinaryThumb(undefined, 400), "");
});
