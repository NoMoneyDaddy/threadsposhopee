import { NextResponse } from "next/server";
import { createSource } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body.threads_account_id || !body.source_username) {
      return NextResponse.json({ ok: false, error: "缺少 threads_account_id 或 source_username" }, { status: 400 });
    }
    const source = await createSource({
      threads_account_id: body.threads_account_id,
      shopee_account_id: body.shopee_account_id || null,
      source_username: String(body.source_username),
      poll_interval_minutes:
        body.poll_interval_minutes && Number(body.poll_interval_minutes) > 0
          ? Number(body.poll_interval_minutes)
          : undefined,
      auto_publish: Boolean(body.auto_publish),
      posts_limit: body.posts_limit && Number(body.posts_limit) > 0 ? Number(body.posts_limit) : undefined
    });
    return NextResponse.json({ ok: true, source });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
