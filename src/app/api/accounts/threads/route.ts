import { NextResponse } from "next/server";
import { createThreadsAccount } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    const body = await req.json();
    if (!body.label || !body.threads_user_id) {
      return NextResponse.json({ ok: false, error: "缺少 label 或 threads_user_id" }, { status: 400 });
    }
    const account = await createThreadsAccount(
      {
        label: body.label,
        threads_user_id: String(body.threads_user_id),
        access_token: body.access_token || undefined,
        client_secret: body.client_secret || undefined,
        token_expires_at: body.token_expires_at || null
      },
      user.id
    );
    return NextResponse.json({ ok: true, account });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
