// AI 文案客製化偏好：每位使用者在帳號管理頁設定的全域預設。
// 語氣／長度可分別套用在「正文」與「留言」，溫度為整體創意度。
// 本專案文案一律不使用 emoji／表情符號，故無 emoji 偏好；該硬規則寫在 humanizer。
// 偏好非機密，明文存 profiles.copy_prefs（jsonb）；舊資料殘留的 emoji 欄位會被忽略。

export type Tone = "friendly" | "professional" | "humorous" | "concise";
export type Length = "short" | "medium" | "long";

export interface SidePrefs {
  tone: Tone;
  length: Length;
}

export interface CopyPrefs {
  temperature: number; // 0..1，越高越發散
  customPrompt?: string; // 使用者追加的自訂指示（接在內建規則之後）
  main: SidePrefs;
  reply: SidePrefs;
}

export const DEFAULT_COPY_PREFS: CopyPrefs = {
  temperature: 0.9,
  main: { tone: "friendly", length: "medium" },
  reply: { tone: "friendly", length: "short" }
};

const TONES: Tone[] = ["friendly", "professional", "humorous", "concise"];
const LENGTHS: Length[] = ["short", "medium", "long"];
const CUSTOM_PROMPT_MAX = 1000;

const oneOf = <T,>(allowed: T[], v: unknown, fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;

function normalizeSide(v: unknown, fallback: SidePrefs): SidePrefs {
  const s = (v ?? {}) as Partial<SidePrefs>;
  return {
    tone: oneOf(TONES, s.tone, fallback.tone),
    length: oneOf(LENGTHS, s.length, fallback.length)
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

const MAIN_LENGTH_DESC: Record<Length, string> = {
  short: "30-60 字，1-2 行",
  medium: "30-105 字，1-3 行",
  long: "80-150 字，2-4 行"
};

const REPLY_LENGTH_DESC: Record<Length, string> = {
  short: "一句話帶過",
  medium: "一到兩句",
  long: "兩到三句"
};

export function describeMain(p: SidePrefs): string {
  return `語氣：${TONE_DESC[p.tone]}；長度：${MAIN_LENGTH_DESC[p.length]}`;
}

export function describeReply(p: SidePrefs): string {
  return `語氣：${TONE_DESC[p.tone]}；長度：${REPLY_LENGTH_DESC[p.length]}`;
}
