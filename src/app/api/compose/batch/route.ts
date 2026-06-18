import { NextResponse } from "next/server";
import { resolveMaterialFromUrl } from "@/services/materials/fromUrl";
import { createDraftFromMaterial, listTakenScheduledSlots } from "@/lib/store";
import { nextOpenSlot } from "@/services/publish/slots";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 批次貼連結：一次多個蝦皮連結 → 各自產生素材＋文案 → 建草稿。
// action: "queue"（排進下一個空時段，approved）｜"draft"（存待審）。
// body: { urls: string[], threads_account_id, action }
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const action = body.action === "queue" ? "queue" : "draft";
    const threadsAccountId: string | null = body.threads_account_id || null;
    if (action === "queue" && !threadsAccountId) {
      return NextResponse.json({ ok: false, error: "加入佇列需指定發文帳號" }, { status: 400 });
    }
    const urls: string[] = (Array.isArray(body.urls) ? body.urls : [])
      .map((u: unknown) => (typeof u === "string" ? u.trim() : ""))
      .filter(Boolean)
      .slice(0, 20); // 單次上限 20 筆，避免吃滿 maxDuration
    if (!urls.length) return NextResponse.json({ ok: false, error: "沒有有效連結" }, { status: 400 });

    const taken = action === "queue" ? await listTakenScheduledSlots(user.id) : new Set<string>();
    const startTime = Date.now();
    const results: { url: string; ok: boolean; error?: string; scheduledAt?: string }[] = [];

    for (const url of urls) {
      if (Date.now() - startTime > 50000) {
        results.push({ url, ok: false, error: "本批已達時間上限，請稍後再處理剩餘連結" });
        continue;
      }
      try {
        const { material } = await resolveMaterialFromUrl(url, user, true);
        let scheduledAt: string | null = null;
        if (action === "queue") {
          scheduledAt = nextOpenSlot(taken);
          if (!scheduledAt) {
            results.push({ url, ok: false, error: "30 天內時段已滿" });
            continue;
          }
          taken.add(scheduledAt);
        }
        await createDraftFromMaterial(material, {
          owner_id: user.id,
          threads_account_id: threadsAccountId,
          status: action === "queue" ? "approved" : "draft",
          scheduled_at: scheduledAt
        });
        results.push({ url, ok: true, scheduledAt: scheduledAt ?? undefined });
      } catch (e) {
        results.push({ url, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }

    const done = results.filter((r) => r.ok).length;
    return NextResponse.json({ ok: true, done, total: urls.length, results });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
