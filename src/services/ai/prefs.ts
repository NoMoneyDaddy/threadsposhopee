// AI 文案客製化偏好：每位使用者在帳號管理頁設定的全域預設。
// 語氣／字數／emoji 數量可分別套用在「正文」與「留言」，溫度為整體創意度。
// AI 產生的貼文文案可適度使用 emoji（數量由 emojiMax 客製，0＝不用）；
// 注意：這是「AI 文案輸出」可帶 emoji，與主站自身 UI 一律用 SVG／不放 emoji 是兩回事。
// 偏好非機密，明文存 profiles.copy_prefs（jsonb）；舊資料殘留的欄位（如 length）會被忽略。

export type Tone = "friendly" | "professional" | "humorous" | "concise";

export interface SidePrefs {
  tone: Tone;
  maxChars: number; // 字數上限（客製；夾在合理範圍）
  emojiMax: number; // emoji 數量上限（0＝不用；客製）
}

export interface CopyPrefs {
  temperature: number; // 0..1，越高越發散
  customPrompt?: string; // 使用者追加的自訂指示（接在內建規則之後）
  main: SidePrefs;
  reply: SidePrefs;
}

// 字數夾在 Threads 單則上限（500）以內並留緩衝；emoji 上限給合理天花板避免被塞滿。
const CHARS_MIN = 20;
const CHARS_MAX = 480;
const EMOJI_MIN = 0;
const EMOJI_MAX = 8;

export const DEFAULT_COPY_PREFS: CopyPrefs = {
  temperature: 0.9,
  main: { tone: "friendly", maxChars: 105, emojiMax: 2 },
  reply: { tone: "friendly", maxChars: 60, emojiMax: 1 }
};

const TONES: Tone[] = ["friendly", "professional", "humorous", "concise"];
const CUSTOM_PROMPT_MAX = 1000;

const oneOf = <T,>(allowed: T[], v: unknown, fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;

// 把數值客製欄位夾進合法整數範圍；非數值/NaN 退回預設。
const clampInt = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.min(max, Math.max(min, n));
};

function normalizeSide(v: unknown, fallback: SidePrefs): SidePrefs {
  const s = (v ?? {}) as Partial<SidePrefs>;
  return {
    tone: oneOf(TONES, s.tone, fallback.tone),
    maxChars: clampInt(s.maxChars, CHARS_MIN, CHARS_MAX, fallback.maxChars),
    emojiMax: clampInt(s.emojiMax, EMOJI_MIN, EMOJI_MAX, fallback.emojiMax)
  };
}

// 把不可信輸入（DB/HTTP body）夾成合法 CopyPrefs，無效欄位退回預設，溫度夾在 0..1。
export function normalizeCopyPrefs(input: unknown): CopyPrefs {
  const p = (input ?? {}) as Partial<CopyPrefs>;
  const temp = typeof p.temperature === "number" && Number.isFinite(p.temperature) ? p.temperature : DEFAULT_COPY_PREFS.temperature;
  const custom = typeof p.customPrompt === "string" ? p.customPrompt.trim().slice(0, CUSTOM_PROMPT_MAX) : "";
  const out: CopyPrefs = {
    temperature: Math.min(1, Math.max(0, temp)),
    main: normalizeSide(p.main, DEFAULT_COPY_PREFS.main),
    reply: normalizeSide(p.reply, DEFAULT_COPY_PREFS.reply)
  };
  if (custom) out.customPrompt = custom; // 空字串不設 key，讓預設物件可全等比較
  return out;
}

// —— 中文描述對照（給 prompt 用） ——
const TONE_DESC: Record<Tone, string> = {
  friendly: "像跟朋友聊天，輕鬆口語",
  professional: "像懂行的人專業推薦，可信但不死板",
  humorous: "帶點幽默或自嘲，逗趣但不尷尬",
  concise: "精簡直接、一針見血，不囉嗦"
};

// emoji 用量描述：0＝完全不用；否則給「最多 N 個、自然點綴」的彈性指示。
function emojiDesc(max: number): string {
  return max <= 0 ? "完全不要用 emoji" : `最多 ${max} 個 emoji，自然點綴、別浮誇，沒適合的就不用`;
}

export function describeMain(p: SidePrefs): string {
  return `語氣：${TONE_DESC[p.tone]}；字數約 ${p.maxChars} 字以內、可分多行；${emojiDesc(p.emojiMax)}`;
}

export function describeReply(p: SidePrefs): string {
  return `語氣：${TONE_DESC[p.tone]}；字數約 ${p.maxChars} 字以內；${emojiDesc(p.emojiMax)}`;
}
