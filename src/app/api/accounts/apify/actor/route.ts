import { NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { setApifyActor } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";
import { isAllowedThreadsActor } from "@/lib/apify-actors";

export const dynamic = "force-dynamic";

// 只切換抓文 actor（不重綁 token）。僅平台管理員；actor 限白名單（新/舊兩個已知 schema 的 actor）。
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    if (!user.isOwner) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const actor = typeof body.actor === "string" ? body.actor.trim() : "";
    if (!isAllowedThreadsActor(actor)) {
      return NextResponse.json({ ok: false, error: "不支援的 actor" }, { status: 400 });
    }
    await setApifyActor(user.id, actor);
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error("apify actor switch failed", { err: e });
    return NextResponse.json({ ok: false, error: "伺服器暫時無法處理，請稍後再試" }, { status: 500 });
  }
}
