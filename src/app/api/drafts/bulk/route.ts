import { NextResponse } from "next/server";
import { getDraft, updateDraftStatus, deleteDraft, listTakenScheduledSlots } from "@/lib/store";
import { nextOpenSlot } from "@/services/publish/slots";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 批次操作待審草稿：approve / reject / delete / queue（排進下一個空時段）。
// body: { ids: string[], action }
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === "string") : [];
  const action = body.action;
  if (!ids.length) return NextResponse.json({ ok: false, error: "沒有選取草稿" }, { status: 400 });
  if (!["approve", "reject", "delete", "queue"].includes(action)) {
    return NextResponse.json({ ok: false, error: "不支援的批次動作" }, { status: 400 });
  }

  // queue：先取已占用時段，逐筆往後配；用 local set 累加避免同批撞同一格
  const taken = action === "queue" ? await listTakenScheduledSlots(user.id) : new Set<string>();

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
      } else if (action === "queue") {
        const slot = nextOpenSlot(taken);
        if (!slot) {
          errors.push(`${id}: 30 天內時段已滿`);
          continue;
        }
        taken.add(slot);
        await updateDraftStatus(id, "approved", { scheduled_at: slot });
      }
      done++;
    } catch (e) {
      errors.push(`${id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({ ok: true, done, errors });
}
