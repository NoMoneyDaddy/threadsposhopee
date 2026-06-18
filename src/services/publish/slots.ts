import { env } from "@/lib/env";

// 「加入佇列」：把貼文排進下一個尚未被占用的每日發文時段（仿 Buffer 的 Queue）。
// 時段以 Asia/Taipei（固定 UTC+8，無 DST）計算，回傳 UTC ISO 字串。
const TAIPEI_OFFSET_MIN = 8 * 60;

export function nextOpenSlot(takenIso: Set<string>, fromMs = Date.now(), daysAhead = 30): string | null {
  const slots = env.publishSlots.length ? env.publishSlots : ["09:00", "12:30", "20:00"];
  // 以台北當地日曆日為基準（把 now 平移 +8h 後讀 UTC 年月日 = 台北的年月日）
  const taipeiNow = new Date(fromMs + TAIPEI_OFFSET_MIN * 60_000);

  for (let d = 0; d < daysAhead; d++) {
    const base = new Date(taipeiNow);
    base.setUTCDate(base.getUTCDate() + d);
    const Y = base.getUTCFullYear();
    const M = base.getUTCMonth();
    const D = base.getUTCDate();
    for (const slot of slots) {
      const [h, m] = slot.split(":").map(Number);
      // 台北 h:m → UTC 時刻（台北 = UTC+8）
      const utcMs = Date.UTC(Y, M, D, h - 8, m, 0, 0);
      if (utcMs <= fromMs) continue; // 已過的時段跳過
      const iso = new Date(utcMs).toISOString();
      if (!takenIso.has(iso)) return iso;
    }
  }
  return null;
}
