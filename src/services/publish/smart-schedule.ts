// 智慧排程：預設把待發內容排進「該帳號成效最佳的時段」，並讓同一天多篇分散開來。
// 成效樣本不足（getBestHours 回 []）時自動退回使用者自訂／系統預設 PUBLISH_SLOTS。
// 兩種路徑都套使用者的防封節奏（最小間隔／每日上限），確保排出來的時間＝發文層真正會發的時間。
import { getBestHours } from "@/services/threads/engagement";
import { getPublishPrefs } from "@/lib/store";
import { nextOpenSlot, nextOpenSlotAtHours, type SlotPacing } from "./slots";

// 從「依平均觀看由高到低排序的最佳整點」挑出排程用時段（純函式可測）：
// - 只取前 cap 個（避免資料雜訊時排到其實普通的時段）。
// - 去重後改依「時鐘順序」排列：firstOpenSlot 會在每天依序嘗試各時段＋防封間隔，
//   時鐘順序能讓同一天的多篇自然分散到早/午/晚，而非全擠在單一最高時段。
export function spreadScheduleHours(rankedHours: number[], cap = 6): number[] {
  const valid = rankedHours.filter((h) => Number.isInteger(h) && h >= 0 && h <= 23);
  const top = Array.from(new Set(valid)).slice(0, Math.max(1, cap));
  return top.sort((a, b) => a - b);
}

// 解析排程 picker：預設依「成效最佳時段（分散）」；useBest=false 或成效不足 → 用預設時段。
// 讀取偏好失敗時退回系統預設時段（與 repost／compose 既有 .catch(()=>null) 行為一致）。
// 注意：autoScheduleApproved（免審直發）有不同的錯誤契約（prefs 失敗要回 null），故不共用此函式。
// 回傳 picker 與 usedBest（是否真的套用了成效最佳時段；資料不足退回預設時段時為 false），
// 讓呼叫端能據實回報「（最佳時段）」而非僅依使用者意圖。
export async function resolveSchedulePicker(
  ownerId: string,
  useBest: boolean
): Promise<{ pick: (taken: Set<string>) => string | null; usedBest: boolean }> {
  const prefs = await getPublishPrefs(ownerId).catch(() => null);
  const pacing: SlotPacing = { gapMinutes: prefs?.minGapMinutes, maxPerDay: prefs?.maxPerDay };
  const hours = useBest ? spreadScheduleHours(await getBestHours(ownerId).catch(() => [])) : [];
  if (hours.length) {
    return { pick: (taken: Set<string>) => nextOpenSlotAtHours(taken, hours, Date.now(), 30, pacing), usedBest: true };
  }
  return { pick: (taken: Set<string>) => nextOpenSlot(taken, Date.now(), 30, prefs?.slots, pacing), usedBest: false };
}
