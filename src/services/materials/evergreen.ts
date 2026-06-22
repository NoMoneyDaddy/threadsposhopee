// 常青內容回收 worker（由總排程呼叫）：把「常青且到期」的素材自動重排成「待審草稿」，
// 重用既有連結/文案/媒體、不重燒 AI token。一律建 draft（待人工核准），不直接發布。
import { listEvergreenDueAll, touchEvergreen, createDraftFromMaterial } from "@/lib/store";
import { listActiveThreadsAccountsAll } from "@/lib/accounts-store";
import { log } from "@/lib/logger";

// 預設每 14 天回收一次；單輪全域上限避免一次灌爆佇列（防封）。
export const EVERGREEN_MIN_DAYS = 14;
const MAX_PER_RUN = 20;

export async function runEvergreen(): Promise<{ created: number; skipped: number }> {
  const due = await listEvergreenDueAll(EVERGREEN_MIN_DAYS, MAX_PER_RUN).catch((e) => {
    log.error("常青回收：列出到期素材失敗", { err: e });
    return [];
  });
  if (due.length === 0) return { created: 0, skipped: 0 };

  // owner → 該 owner 的第一個啟用發文帳號（常青草稿掛在這個帳號底下，待審後由發文佇列處理）。
  const accounts = await listActiveThreadsAccountsAll().catch(() => []);
  const firstAccountByOwner = new Map<string, string>();
  for (const a of accounts) if (!firstAccountByOwner.has(a.owner_id)) firstAccountByOwner.set(a.owner_id, a.id);

  let created = 0;
  let skipped = 0;
  for (const m of due) {
    const ownerId = m.owner_id;
    const accountId = ownerId ? firstAccountByOwner.get(ownerId) : undefined;
    // 沒有 owner 或該 owner 無啟用帳號：跳過但仍 touch，避免每輪重複挑到同一筆而卡住其他素材。
    if (!ownerId || !accountId) {
      skipped++;
      await touchEvergreen(m.id).catch(() => {});
      continue;
    }
    try {
      await createDraftFromMaterial(m, { owner_id: ownerId, threads_account_id: accountId, status: "draft" });
      await touchEvergreen(m.id);
      created++;
    } catch (e) {
      log.error("常青回收：建立草稿失敗", { materialId: m.id, err: e });
      skipped++;
    }
  }
  return { created, skipped };
}
