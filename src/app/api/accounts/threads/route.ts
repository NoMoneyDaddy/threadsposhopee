import { NextResponse } from "next/server";
import { createThreadsAccount } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body.label || !body.threads_user_id) {
      return NextResponse.json({ ok: false, error: "缺少 label 或 threads_user_id" }, { status: 400 });
    }
    const account = await createThreadsAccount({
      label: body.label,
      threads_user_id: String(body.threads_user_id),
      access_token: body.access_token || undefined,
      client_secret: body.client_secret || undefined,
      token_expires_at: body.token_expires_at || null
    });
    return NextResponse.json({ ok: true, account });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
