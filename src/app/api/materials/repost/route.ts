import { NextResponse } from "next/server";
import { getMaterial, createDraftFromMaterial, listTakenScheduledSlots } from "@/lib/store";
import { nextOpenSlot } from "@/services/publish/slots";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 重發：從既有素材再產生一篇草稿（重用文案/連結/媒體，不重燒 token）。
// action: "queue"（排進下一個空時段，approved）｜"draft"（存待審，預設）。
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    const ownerId = user.id;

    const body = await req.json();
    if (!body.material_id || !body.threads_account_id) {
      return NextResponse.json({ ok: false, error: "缺少 material_id 或 threads_account_id" }, { status: 400 });
    }
    const material = await getMaterial(body.material_id, ownerId);
    if (!material) return NextResponse.json({ ok: false, error: "找不到素材" }, { status: 404 });

    const action = body.action === "queue" ? "queue" : "draft";
    let scheduledAt: string | null = null;
    if (action === "queue") {
      const taken = await listTakenScheduledSlots(ownerId);
      scheduledAt = nextOpenSlot(taken);
      if (!scheduledAt) return NextResponse.json({ ok: false, error: "30 天內時段已滿" }, { status: 409 });
    }

    const draft = await createDraftFromMaterial(material, {
      owner_id: ownerId,
      threads_account_id: body.threads_account_id,
      status: action === "queue" ? "approved" : "draft",
      scheduled_at: scheduledAt
    });
    return NextResponse.json({ ok: true, draft, scheduledAt });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
