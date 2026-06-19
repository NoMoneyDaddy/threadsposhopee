import { NextResponse } from "next/server";
import { createShopeeAccount } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";
import { validateShopeeCredentials } from "@/services/shopee/affiliate";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const label = typeof body.label === "string" ? body.label.trim() : "";
    const appId = typeof body.app_id === "string" ? body.app_id.trim() : "";
    const secret = typeof body.secret === "string" ? body.secret.trim() : "";
    if (!label || !appId || !secret) {
      return NextResponse.json({ ok: false, error: "缺少 label / app_id / secret" }, { status: 400 });
    }
    const subId = typeof body.default_sub_id === "string" ? body.default_sub_id.trim() : "";
    const check = await validateShopeeCredentials(appId, secret);
    if (!check.ok) return NextResponse.json({ ok: false, error: check.reason }, { status: 400 });
    const account = await createShopeeAccount(
      {
        label,
        app_id: appId,
        secret,
        default_sub_id: subId || undefined
      },
      user.id
    );
    return NextResponse.json({ ok: true, account });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
