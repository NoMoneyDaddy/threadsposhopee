import { NextResponse } from "next/server";
import { getDraft, updateDraftStatus, deleteDraft, listThreadsAccounts, listTakenScheduledSlots } from "@/lib/store";
import { withNextSlot } from "@/services/publish/slots";
import { resolveSchedulePicker } from "@/services/publish/smart-schedule";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 批次操作草稿：approve / reject / delete / queue（排進下一個空時段）/ retry（失敗或卡住的重排）/
// distribute（平均分派到所有啟用帳號＋智能排程錯開）。
// body: { ids: string[], action }
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === "string") : [];
  const action = body.action;
  if (!ids.length) return NextResponse.json({ ok: false, error: "沒有選取草稿" }, { status: 400 });
  if (!["approve", "reject", "delete", "queue", "retry", "distribute"].includes(action)) {
    return NextResponse.json({ ok: false, error: "不支援的批次動作" }, { status: 400 });
  }

  // distribute：把選取的草稿輪流分派到各啟用帳號（round-robin），並用智能排程（成效最佳時段＋分散、
  // 套防封節奏）逐篇排到不撞格的時段——一次把一批內容鋪到多帳號、時間自動錯開。
  if (action === "distribute") {
    const accounts = (await listThreadsAccounts(user.id)).filter((a) => a.status === "active");
    if (accounts.length === 0) {
      return NextResponse.json({ ok: false, error: "沒有啟用中的發文帳號可分派" }, { status: 400 });
    }
    const { pick, usedBest } = await resolveSchedulePicker(user.id, true);
    const taken = await listTakenScheduledSlots(user.id); // 跨帳號已占用時段；逐篇 pick 後加入避免撞格
    let done = 0;
    let assignIdx = 0;
    const errors: string[] = [];
    for (const id of ids) {
      const draft = await getDraft(id, user.id); // 擁有權檢查
      if (!draft) {
        errors.push(`${id}: 找不到或無權限`);
        continue;
      }
      const slot = pick(taken);
      if (!slot) {
        errors.push(`${id}: 30 天內時段已滿`);
        continue;
      }
      const acc = accounts[assignIdx % accounts.length];
      try {
        await updateDraftStatus(id, "approved", { threads_account_id: acc.id, scheduled_at: slot }, user.id);
        taken.add(slot);
        assignIdx++;
        done++;
      } catch (e) {
        errors.push(`${id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return NextResponse.json({ ok: true, done, errors, accounts: accounts.length, usedBest });
  }

  let done = 0;
  const errors: string[] = [];
  for (const id of ids) {
    const draft = await getDraft(id, user.id); // 擁有權檢查
    if (!draft) {
      errors.push(`${id}: 找不到或無權限`);
      continue;
    }
    try {
      if (action === "delete") {
        await deleteDraft(id, user.id);
      } else if (action === "reject") {
        await updateDraftStatus(id, "rejected");
      } else if (action === "approve") {
        await updateDraftStatus(id, "approved", { scheduled_at: null });
      } else if (action === "retry") {
        // 只重試 failed 的草稿，重置回 approved 並清錯誤；其餘略過。
        // 卡在 publishing 的草稿「不」在此重置：可能正被 worker 發布中，強制改回 approved
        // 會與正在進行的發布競態造成重複發文（封號風險）。交由 reclaimStalePublishing
        // （逾時自動回收為 failed）處理後，再由使用者批次重試。
        if (draft.status !== "failed") {
          errors.push(`${id}: 非失敗狀態，略過`);
          continue;
        }
        await updateDraftStatus(id, "approved", { error: null });
      } else if (action === "queue") {
        // 每筆即時配下一個空時段，撞格自動重試（前一筆已提交故會避開）
        const ok = await withNextSlot(user.id, (slot) => updateDraftStatus(id, "approved", { scheduled_at: slot }));
        if (!ok) {
          errors.push(`${id}: 30 天內時段已滿`);
          continue;
        }
      }
      done++;
    } catch (e) {
      errors.push(`${id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({ ok: true, done, errors });
}
