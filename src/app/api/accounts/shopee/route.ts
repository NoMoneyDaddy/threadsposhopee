import { NextResponse } from "next/server";
import { createShopeeAccount } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    const body = await req.json();
    if (!body.label || !body.app_id || !body.secret) {
      return NextResponse.json({ ok: false, error: "缺少 label / app_id / secret" }, { status: 400 });
    }
    const account = await createShopeeAccount(
      {
        label: body.label,
        app_id: String(body.app_id),
        secret: String(body.secret),
        default_sub_id: body.default_sub_id || undefined
      },
      user.id
    );
    return NextResponse.json({ ok: true, account });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
