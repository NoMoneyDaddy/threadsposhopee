import { test } from "node:test";
import assert from "node:assert/strict";
import { splitCopy } from "./humanizer";

test("splitCopy：正文／留言區 標記正確切分並去前綴", () => {
  assert.deepEqual(splitCopy("正文：今天介紹好物\n留言區：連結 https://x"), {
    mainText: "今天介紹好物",
    replyText: "連結 https://x"
  });
});

test("splitCopy：相容半形冒號與空格（LLM 常見輸出）", () => {
  assert.deepEqual(splitCopy("正文: 今天介紹好物\n留言區: 連結 https://x"), {
    mainText: "今天介紹好物",
    replyText: "連結 https://x"
  });
});

test("splitCopy：無留言區 → 留言用預設語", () => {
  assert.deepEqual(splitCopy("正文：只有正文"), {
    mainText: "只有正文",
    replyText: "有問題歡迎私訊！"
  });
});

test("splitCopy：無正文前綴也可", () => {
  assert.deepEqual(splitCopy("純文字內容"), {
    mainText: "純文字內容",
    replyText: "有問題歡迎私訊！"
  });
});
