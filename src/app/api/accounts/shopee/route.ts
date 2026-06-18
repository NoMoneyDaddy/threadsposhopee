import { NextResponse } from "next/server";
import { createShopeeAccount } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body.label || !body.app_id || !body.secret) {
      return NextResponse.json({ ok: false, error: "缺少 label / app_id / secret" }, { status: 400 });
    }
    const account = await createShopeeAccount({
      label: body.label,
      app_id: String(body.app_id),
      secret: String(body.secret),
      default_sub_id: body.default_sub_id || undefined
    });
    return NextResponse.json({ ok: true, account });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
