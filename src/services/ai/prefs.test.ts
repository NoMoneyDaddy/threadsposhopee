import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeCopyPrefs, DEFAULT_COPY_PREFS } from "./prefs";
import { buildCopyPrompt } from "./humanizer";

test("空輸入 → 預設值", () => {
  assert.deepEqual(normalizeCopyPrefs(undefined), DEFAULT_COPY_PREFS);
  assert.deepEqual(normalizeCopyPrefs({}), DEFAULT_COPY_PREFS);
});

test("溫度夾在 0..1", () => {
  assert.equal(normalizeCopyPrefs({ temperature: 5 }).temperature, 1);
  assert.equal(normalizeCopyPrefs({ temperature: -3 }).temperature, 0);
  assert.equal(normalizeCopyPrefs({ temperature: 0.4 }).temperature, 0.4);
  assert.equal(normalizeCopyPrefs({ temperature: Number.NaN }).temperature, DEFAULT_COPY_PREFS.temperature);
});

test("非法 tone 退回預設、合法值保留；殘留舊 length 欄位被忽略", () => {
  const p = normalizeCopyPrefs({
    main: { tone: "humorous", maxChars: 120, emojiMax: 3, length: "long" }, // length 為舊欄位，應被忽略
    reply: { tone: "x", maxChars: 40, emojiMax: 0 }
  });
  assert.equal(p.main.tone, "humorous");
  assert.equal(p.main.maxChars, 120);
  assert.equal(p.main.emojiMax, 3);
  assert.equal((p.main as unknown as Record<string, unknown>).length, undefined); // length 偏好已移除
  assert.equal(p.reply.tone, DEFAULT_COPY_PREFS.reply.tone); // x → 預設
  assert.equal(p.reply.emojiMax, 0);
});

test("字數與 emoji 數量夾在合理範圍、取整、非數值退回預設", () => {
  const p = normalizeCopyPrefs({
    main: { tone: "friendly", maxChars: 9999, emojiMax: 99 }, // 超界 → 夾到上限
    reply: { tone: "friendly", maxChars: 1, emojiMax: -5 } // 低於下限 → 夾到下限
  });
  assert.equal(p.main.maxChars, 480);
  assert.equal(p.main.emojiMax, 8);
  assert.equal(p.reply.maxChars, 20);
  assert.equal(p.reply.emojiMax, 0);
  // 非數值 → 退回預設
  const q = normalizeCopyPrefs({ main: { tone: "friendly", maxChars: "abc", emojiMax: null } });
  assert.equal(q.main.maxChars, DEFAULT_COPY_PREFS.main.maxChars);
  assert.equal(q.main.emojiMax, DEFAULT_COPY_PREFS.main.emojiMax);
  // 小數 → 取整
  assert.equal(normalizeCopyPrefs({ main: { tone: "friendly", maxChars: 100.7, emojiMax: 2.4 } }).main.maxChars, 101);
});

test("customPrompt 去空白並截斷上限", () => {
  assert.equal(normalizeCopyPrefs({ customPrompt: "  hi  " }).customPrompt, "hi");
  assert.equal(normalizeCopyPrefs({ customPrompt: "" }).customPrompt, undefined);
  assert.equal(normalizeCopyPrefs({ customPrompt: "x".repeat(2000) }).customPrompt?.length, 1000);
});

test("buildCopyPrompt 注入偏好（語氣／字數）與自訂指示", () => {
  const prompt = buildCopyPrompt(
    { productName: "保溫瓶", shopeeShortLink: "https://s.shopee/x" },
    normalizeCopyPrefs({ customPrompt: "多講保溫效果", main: { tone: "professional", maxChars: 80, emojiMax: 0 } })
  );
  assert.match(prompt, /保溫瓶/);
  assert.match(prompt, /多講保溫效果/);
  assert.match(prompt, /專業推薦/); // professional 語氣描述
  assert.match(prompt, /字數約 80 字/); // 字數客製注入
  assert.match(prompt, /完全不要用 emoji/); // main emojiMax=0
});

test("emoji 數量客製反映在 prompt（>0 給上限、=0 禁用）", () => {
  const withEmoji = buildCopyPrompt(
    { productName: "x", shopeeShortLink: "y" },
    normalizeCopyPrefs({ main: { tone: "friendly", maxChars: 100, emojiMax: 3 }, reply: { tone: "friendly", maxChars: 50, emojiMax: 0 } })
  );
  assert.match(withEmoji, /最多 3 個 emoji/); // 正文允許 3 個
  assert.match(withEmoji, /完全不要用 emoji/); // 留言設 0
});
