import { NextResponse } from "next/server";
import { getDraft, updateDraftStatus, deleteDraft } from "@/lib/store";
import { withNextSlot } from "@/services/publish/slots";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 批次操作草稿：approve / reject / delete / queue（排進下一個空時段）/ retry（失敗或卡住的重排）。
// body: { ids: string[], action }
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === "string") : [];
  const action = body.action;
  if (!ids.length) return NextResponse.json({ ok: false, error: "沒有選取草稿" }, { status: 400 });
  if (!["approve", "reject", "delete", "queue", "retry"].includes(action)) {
    return NextResponse.json({ ok: false, error: "不支援的批次動作" }, { status: 400 });
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
        // 只重試失敗或卡在 publishing（程序中斷）的草稿，重置回 approved 並清錯誤；其餘略過。
        if (draft.status !== "failed" && draft.status !== "publishing") {
          errors.push(`${id}: 非失敗/卡住，略過`);
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
