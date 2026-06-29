import { test } from "node:test";
import assert from "node:assert/strict";
import { splitCopy, buildCopyPrompt, buildCopyPromptPreview, pickReplyLeadIn, pickPostAngle, HUMANIZER_RULES, ANTI_AI_SLOP_RULES, THREADS_REACH_RULES } from "./humanizer";

// 常見 emoji / 表情符號範圍（含 🔗😅 與變體選擇符）。
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u;

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

test("buildCopyPrompt：prompt 模板本身不含任何 emoji 字元（emoji 由模型依數量上限自行點綴）", () => {
  // 模板文字（規則、格式、開場句）皆不放實體 emoji；emoji 多寡交給模型依 emojiMax 決定。
  const p = buildCopyPrompt({ productName: "藍牙耳機", shopeeShortLink: "https://go2read.link/r/abc" });
  assert.ok(!EMOJI_RE.test(p), "prompt 模板內不應出現任何 emoji 字元");
});

test("pickReplyLeadIn：穩定（同連結同結果）、無 emoji、不同連結會分散、容錯", () => {
  const a = pickReplyLeadIn("https://go2read.link/r/abc");
  assert.equal(a, pickReplyLeadIn("https://go2read.link/r/abc")); // 穩定可重現
  assert.ok(a.length > 0);
  assert.ok(!EMOJI_RE.test(a));
  // 一批不同 seed 至少要選到 2 種以上開場（確認有輪換、非單一定值）
  const seen = new Set(Array.from({ length: 12 }, (_, i) => pickReplyLeadIn(`https://go2read.link/r/${i}`)));
  assert.ok(seen.size >= 2);
  // 容錯：空字串／非字串（API 異常、草稿未填）不崩潰，回退第一句
  assert.ok(pickReplyLeadIn("").length > 0);
  assert.ok(pickReplyLeadIn(undefined as unknown as string).length > 0);
});

test("HUMANIZER_RULES 內含 Threads 觸及取向規則（短、有立場、誘回覆）", () => {
  assert.ok(HUMANIZER_RULES.includes(THREADS_REACH_RULES));
  assert.match(THREADS_REACH_RULES, /回(你|應)/); // 導向「會讓人想回應」
});

test("pickPostAngle：穩定、輪換、容錯、無 emoji；buildCopyPrompt 帶入開場角度", () => {
  const a = pickPostAngle("https://go2read.link/r/abc");
  assert.equal(a, pickPostAngle("https://go2read.link/r/abc")); // 同連結同角度（重排不亂跳）
  assert.ok(a.length > 0);
  assert.ok(!EMOJI_RE.test(a));
  const seen = new Set(Array.from({ length: 12 }, (_, i) => pickPostAngle(`https://go2read.link/r/${i}`)));
  assert.ok(seen.size >= 2); // 有輪換、非單一定值
  assert.ok(pickPostAngle("").length > 0); // 容錯
  assert.ok(pickPostAngle(undefined as unknown as string).length > 0);
  // 角度與留言開場用不同 salt，不應永遠相等
  assert.notEqual(pickPostAngle("https://go2read.link/r/abc"), pickReplyLeadIn("https://go2read.link/r/abc"));
  const p = buildCopyPrompt({ productName: "藍牙耳機", shopeeShortLink: "https://go2read.link/r/abc" });
  assert.match(p, /開場角度：/);
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
