// 每位使用者發文節奏設定（純函式：解析/驗證；DB 讀寫在 credentials.ts）。
export interface PublishPrefs {
  slots: string[]; // 每日發文時段 HH:MM（Asia/Taipei）
  minGapMinutes: number; // 每帳號每篇最小間隔（分）
  maxPerDay: number; // 每帳號每 24h 上限
}

// 業界建議每帳號最小間隔 ≥ 4 小時，低於此前端會提醒。
export const RECOMMENDED_MIN_GAP_MINUTES = 240;

const HHMM = /^([01]?\d|2[0-3]):[0-5]\d$/;

export function parseSlots(raw: string | null | undefined): string[] {
  if (!raw) return [];
  // 去重、保序、只留合法 HH:MM
  const out: string[] = [];
  for (const s of raw.split(",").map((x) => x.trim())) {
    if (HHMM.test(s) && !out.includes(s)) out.push(s);
  }
  return out;
}

// 驗證使用者輸入（slots 字串、gap、maxPerDay）。回傳清理後值或錯誤訊息。
export function normalizePublishPrefsInput(input: {
  slots?: unknown;
  minGapMinutes?: unknown;
  maxPerDay?: unknown;
}): { ok: true; slots: string[]; minGapMinutes: number | null; maxPerDay: number | null } | { ok: false; error: string } {
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
  return { ok: true, slots, minGapMinutes, maxPerDay };
}
