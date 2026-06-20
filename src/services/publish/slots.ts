import { env } from "@/lib/env";
import { listTakenScheduledSlots } from "@/lib/store";

// 「加入佇列」：把貼文排進下一個尚未被占用的每日發文時段（仿 Buffer 的 Queue）。
// 時段以 Asia/Taipei（固定 UTC+8，無 DST）計算，回傳 UTC ISO 字串。
const TAIPEI_OFFSET_MIN = 8 * 60;

type HM = { h: number; m: number };

// 共用核心：依台北日曆日逐日、逐時段找第一個尚未被占用且在未來的時刻（回 UTC ISO）。
function firstOpenSlot(takenIso: Set<string>, times: HM[], fromMs: number, daysAhead: number): string | null {
  // 以台北當地日曆日為基準（把 now 平移 +8h 後讀 UTC 年月日 = 台北的年月日）
  const taipeiNow = new Date(fromMs + TAIPEI_OFFSET_MIN * 60_000);
  for (let d = 0; d < daysAhead; d++) {
    const base = new Date(taipeiNow);
    base.setUTCDate(base.getUTCDate() + d);
    const Y = base.getUTCFullYear();
    const M = base.getUTCMonth();
    const D = base.getUTCDate();
    for (const { h, m } of times) {
      // 台北 h:m → UTC 時刻（台北 = UTC+8）
      const utcMs = Date.UTC(Y, M, D, h - 8, m, 0, 0);
      if (utcMs <= fromMs) continue; // 已過的時段跳過
      const iso = new Date(utcMs).toISOString();
      if (!takenIso.has(iso)) return iso;
    }
  }
  return null;
}

export function nextOpenSlot(takenIso: Set<string>, fromMs = Date.now(), daysAhead = 30): string | null {
  const times: HM[] = (env.publishSlots.length ? env.publishSlots : ["09:00", "12:30", "20:00"]).map((s) => {
    const [h, m] = s.split(":").map(Number);
    return { h, m };
  });
  return firstOpenSlot(takenIso, times, fromMs, daysAhead);
}

// 依「最佳發文時段」（台北整點，依成效排序）找下一個空時段；hours 為空回 null。
export function nextOpenSlotAtHours(
  takenIso: Set<string>,
  hours: number[],
  fromMs = Date.now(),
  daysAhead = 30
): string | null {
  const times: HM[] = hours.filter((h) => Number.isInteger(h) && h >= 0 && h < 24).map((h) => ({ h, m: 0 }));
  if (times.length === 0) return null;
  return firstOpenSlot(takenIso, times, fromMs, daysAhead);
}

// Postgres 唯一鍵衝突（撞格時 migration 0008 的索引會回 23505）
function isUniqueViolation(e: unknown): boolean {
  return Boolean(e && typeof e === "object" && (e as { code?: string }).code === "23505");
}

// 配下一個空時段並建立草稿；若併發撞格（DB 唯一索引擋下）則重算重試。
// create(slot) 須真正寫入 DB；回傳 null 代表 30 天內無空檔。
export async function withNextSlot<T>(
  ownerId: string,
  create: (slot: string) => Promise<T>,
  maxRetry = 5,
  pickSlot: (taken: Set<string>) => string | null = (taken) => nextOpenSlot(taken)
): Promise<T | null> {
  for (let i = 0; i < maxRetry; i++) {
    const taken = await listTakenScheduledSlots(ownerId);
    const slot = pickSlot(taken);
    if (!slot) return null;
    try {
      return await create(slot);
    } catch (e) {
      if (isUniqueViolation(e)) continue; // 撞格 → 重新抓已占用時段再試
      throw e;
    }
  }
  throw new Error("配置發文時段失敗（多次重試仍撞格），請稍後再試");
}
