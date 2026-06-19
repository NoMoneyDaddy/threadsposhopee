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

test("非法 enum 退回預設、合法值保留", () => {
  const p = normalizeCopyPrefs({
    main: { tone: "humorous", length: "long", emoji: "bogus" },
    reply: { tone: "x", length: "short", emoji: "none" }
  });
  assert.equal(p.main.tone, "humorous");
  assert.equal(p.main.length, "long");
  assert.equal(p.main.emoji, DEFAULT_COPY_PREFS.main.emoji); // bogus → 預設
  assert.equal(p.reply.tone, DEFAULT_COPY_PREFS.reply.tone); // x → 預設
  assert.equal(p.reply.emoji, "none");
});

test("customPrompt 去空白並截斷上限", () => {
  assert.equal(normalizeCopyPrefs({ customPrompt: "  hi  " }).customPrompt, "hi");
  assert.equal(normalizeCopyPrefs({ customPrompt: "" }).customPrompt, undefined);
  assert.equal(normalizeCopyPrefs({ customPrompt: "x".repeat(2000) }).customPrompt?.length, 1000);
});

test("buildCopyPrompt 注入偏好與自訂指示", () => {
  const prompt = buildCopyPrompt(
    { productName: "保溫瓶", shopeeShortLink: "https://s.shopee/x" },
    normalizeCopyPrefs({ customPrompt: "多講保溫效果", main: { tone: "professional", length: "short", emoji: "none" } })
  );
  assert.match(prompt, /保溫瓶/);
  assert.match(prompt, /多講保溫效果/);
  assert.match(prompt, /專業推薦/); // professional 語氣描述
  assert.match(prompt, /完全不要用 emoji/); // emoji none
});

test("emoji none 不會出現在預設 prompt（預設 few）", () => {
  const prompt = buildCopyPrompt({ productName: "x", shopeeShortLink: "y" });
  assert.match(prompt, /最多 1-2 個 emoji/);
});
