// 「免審直接排程」共用邏輯（opt-in）：把一篇待發內容自動排進下一個空時段並標記為已核准（approved），
// 之後由發文佇列依防封節奏發出，全程不經人工審核。
// 使用者自訂發文時段優先，未設則用系統預設；30 天內若無空檔回 null，呼叫端應退回「待審草稿」保底（不遺失內容）。
import { getPublishPrefs } from "@/lib/store";
import { getBestHours } from "@/services/threads/engagement";
import { withNextSlot } from "./slots";
import { spreadScheduleHours, buildSchedulePicker } from "./smart-schedule";
import type { Draft } from "@/lib/types";

export async function autoScheduleApproved(
  ownerId: string,
  create: (slot: string) => Promise<Draft>
): Promise<Draft | null> {
  // 讀取發文偏好失敗時回 null（讓上游退回待審草稿），不冒險用系統預設時段把內容免審直發出去。
  let slots: string[] | undefined;
  let pacing: { gapMinutes?: number; maxPerDay?: number } | undefined;
  try {
    const prefs = await getPublishPrefs(ownerId);
    slots = prefs?.slots;
    pacing = { gapMinutes: prefs?.minGapMinutes, maxPerDay: prefs?.maxPerDay };
  } catch {
    return null;
  }
  // 預設依「成效最佳時段（分散）」排程；成效不足回 [] → 退回使用者自訂／系統預設時段。
  // 成效查詢失敗不影響免審直發（仍用預設時段），與「prefs 失敗回 null」的安全契約有別。
  // buildSchedulePicker 內含「最佳時段佔滿 → 退回預設時段」的容錯，挑時段套防封節奏（顯示＝實際）。
  const hours = spreadScheduleHours(await getBestHours(ownerId).catch(() => []));
  const { pick } = buildSchedulePicker(hours, slots, pacing);
  return withNextSlot(ownerId, (slot) => create(slot), 5, pick);
}
