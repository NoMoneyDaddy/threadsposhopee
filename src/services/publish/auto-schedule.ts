// 「免審直接排程」共用邏輯（opt-in）：把一篇待發內容自動排進下一個空時段並標記為已核准（approved），
// 之後由發文佇列依防封節奏發出，全程不經人工審核。
// 使用者自訂發文時段優先，未設則用系統預設；30 天內若無空檔回 null，呼叫端應退回「待審草稿」保底（不遺失內容）。
import { getPublishPrefs } from "@/lib/store";
import { withNextSlot, nextOpenSlot } from "./slots";
import type { Draft } from "@/lib/types";

export async function autoScheduleApproved(
  ownerId: string,
  create: (slot: string) => Promise<Draft>
): Promise<Draft | null> {
  const prefs = await getPublishPrefs(ownerId).catch(() => null);
  const slots = prefs?.slots;
  return withNextSlot(ownerId, (slot) => create(slot), 5, (taken) => nextOpenSlot(taken, Date.now(), 30, slots));
}
