// 每位使用者發文節奏設定（純函式：解析/驗證；DB 讀寫在 credentials.ts）。
export interface PublishPrefs {
  slots: string[]; // 每日發文時段 HH:MM（Asia/Taipei）
  minGapMinutes: number; // 每帳號每篇最小間隔（分）
  maxPerDay: number; // 每帳號每 24h 上限
  replyDelayMinMinutes: number; // 留言（串文 2/n 分潤連結）延遲保底（分）；0＝主文發出後立即補
  replyDelayJitterMinutes: number; // 留言延遲在保底之上的隨機抖動上限（分）
}

// 業界建議每帳號最小間隔 ≥ 4 小時，低於此前端會提醒。
export const RECOMMENDED_MIN_GAP_MINUTES = 240;

const HHMM = /^([01]?\d|2[0-3]):[0-5]\d$/;

export function parseSlots(raw: string | null | undefined): string[] {
  if (!raw) return [];
  // 去重、保序、只留合法 HH:MM；小時統一補零正規化（"9:00"→"09:00"），
  // 避免與整點格子（補零 HH:MM）比對失敗、產生語意重複（9:00 vs 09:00）或字典序排序錯亂。
  const out: string[] = [];
  for (const s of raw.split(",").map((x) => x.trim())) {
    if (!HHMM.test(s)) continue;
    const [h, m] = s.split(":");
    const norm = `${h.padStart(2, "0")}:${m}`;
    if (!out.includes(norm)) out.push(norm);
  }
  return out;
}

// 驗證使用者輸入（slots 字串、gap、maxPerDay）。回傳清理後值或錯誤訊息。
export function normalizePublishPrefsInput(input: {
  slots?: unknown;
  minGapMinutes?: unknown;
  maxPerDay?: unknown;
  replyDelayMin?: unknown;
  replyDelayJitter?: unknown;
}):
  | { ok: true; slots: string[]; minGapMinutes: number | null; maxPerDay: number | null; replyDelayMin: number | null; replyDelayJitter: number | null }
  | { ok: false; error: string } {
  const slots = parseSlots(typeof input.slots === "string" ? input.slots : "");
  if (typeof input.slots === "string" && input.slots.trim() && slots.length === 0) {
    return { ok: false, error: "發文時段格式需為 HH:MM（逗號分隔），例如 09:00,12:30,20:00" };
  }
  const gap = input.minGapMinutes;
  let minGapMinutes: number | null = null;
  if (gap !== "" && gap !== null && gap !== undefined) {
    const n = Number(gap);
    if (!Number.isInteger(n) || n < 1 || n > 1440) return { ok: false, error: "最小間隔需為 1–1440 的整數（分）" };
    minGapMinutes = n;
  }
  const cap = input.maxPerDay;
  let maxPerDay: number | null = null;
  if (cap !== "" && cap !== null && cap !== undefined) {
    const n = Number(cap);
    if (!Number.isInteger(n) || n < 1 || n > 250) return { ok: false, error: "每日上限需為 1–250 的整數（Threads 硬上限 250）" };
    maxPerDay = n;
  }
  // 留言延遲保底／抖動：可為 0（立即），空白＝沿用系統預設（存 NULL）。上限 1440 分（24h）。
  const parseDelay = (v: unknown, label: string): { ok: true; v: number | null } | { ok: false; error: string } => {
    if (v === "" || v === null || v === undefined) return { ok: true, v: null };
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 1440) return { ok: false, error: `${label}需為 0–1440 的整數（分）` };
    return { ok: true, v: n };
  };
  const rd = parseDelay(input.replyDelayMin, "留言延遲");
  if (!rd.ok) return rd;
  const rj = parseDelay(input.replyDelayJitter, "留言延遲抖動");
  if (!rj.ok) return rj;
  return { ok: true, slots, minGapMinutes, maxPerDay, replyDelayMin: rd.v, replyDelayJitter: rj.v };
}
