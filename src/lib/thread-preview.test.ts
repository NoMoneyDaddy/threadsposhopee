import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAfterSegments } from "./thread-preview";

test("buildAfterSegments：留言＋額外段落依序，空段落濾掉", () => {
  const after = buildAfterSegments({
    replyText: "分潤連結",
    replyMedia: [],
    extraSegments: [{ text: "第三段" }, { text: "  " }, { text: null, media: [] }]
  });
  assert.deepEqual(after.map((s) => s.text), ["分潤連結", "第三段"]);
  // 1（主文）+ 2（after）= 3 則，編號 2/3、3/3
  assert.equal(1 + after.length, 3);
});

test("buildAfterSegments：純媒體留言（無文字）也算一段", () => {
  const after = buildAfterSegments({ replyText: "", replyMedia: [{ url: "https://x/y.jpg", type: "image" }] });
  assert.equal(after.length, 1);
  assert.equal(after[0].text, "");
});

test("buildAfterSegments：無留言也無額外段落＝只有主文（1/1）", () => {
  const after = buildAfterSegments({ replyText: "", replyMedia: [], extraSegments: [] });
  assert.equal(after.length, 0);
  assert.equal(1 + after.length, 1);
});

test("buildAfterSegments：媒體-only 額外段落保留", () => {
  const after = buildAfterSegments({
    replyText: "留言",
    extraSegments: [{ text: null, media: [{ url: "https://x/v.mp4", type: "video" }] }]
  });
  assert.equal(after.length, 2);
  assert.equal(after[1].media?.length, 1);
});

test("buildAfterSegments：空白 url 媒體視為無效，與發布層一致地濾掉", () => {
  const after = buildAfterSegments({
    replyText: "",
    replyMedia: [{ url: "   ", type: "image" }],
    extraSegments: [{ text: null, media: [{ url: "   ", type: "video" }] }]
  });
  assert.equal(after.length, 0);
});
