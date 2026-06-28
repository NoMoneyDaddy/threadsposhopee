import { test } from "node:test";
import assert from "node:assert/strict";
import { splitCopy, buildCopyPrompt, buildCopyPromptPreview, HUMANIZER_RULES, ANTI_AI_SLOP_RULES } from "./humanizer";

test("HUMANIZER_RULES 內含共用去 AI 腔核心（兩個流程共用同一套）", () => {
  assert.ok(HUMANIZER_RULES.includes(ANTI_AI_SLOP_RULES));
});

test("ANTI_AI_SLOP_RULES：涵蓋繁中 AI 腔關鍵 tell", () => {
  for (const tell of ["綜上所述", "凸顯了", "扮演著重要角色", "據說", "三段式排比"]) {
    assert.ok(ANTI_AI_SLOP_RULES.includes(tell), `應禁止：${tell}`);
  }
});

test("buildCopyPrompt：含去 AI 腔規則＋輸出格式（正文／留言區）＋分潤連結", () => {
  const p = buildCopyPrompt({ productName: "藍牙耳機", shopeeShortLink: "https://go2read.link/r/abc" });
  assert.ok(p.includes(ANTI_AI_SLOP_RULES));
  assert.match(p, /正文：/);
  assert.match(p, /留言區：/);
  assert.match(p, /https:\/\/go2read\.link\/r\/abc/);
});

test("buildCopyPromptPreview：管理員預覽用範例情境組出完整 prompt（含規則與範例商品）", () => {
  const p = buildCopyPromptPreview();
  assert.ok(p.includes(ANTI_AI_SLOP_RULES));
  assert.match(p, /範例.*無線藍牙耳機/);
  assert.match(p, /正文：/);
  assert.match(p, /留言區：/);
});

test("去 AI 腔規則自洽：規則區塊外的 prompt 內容不得出現破折號（單/雙）", () => {
  // 規則本身會引用「—」當禁則範例，故先移除規則區塊，再檢查剩餘 prompt（範例/fallback/格式）
  // 是否殘留破折號，否則自相矛盾、誘導模型照抄。
  const outsideRules = buildCopyPromptPreview().replace(ANTI_AI_SLOP_RULES, "");
  assert.ok(!/[—]{1,2}/.test(outsideRules));
});

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
