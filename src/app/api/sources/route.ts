import { NextResponse } from "next/server";
import { createSource, hasApifyCredentials } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 監看來源（抓取）：任何綁定自己 Apify 金鑰的使用者皆可使用。
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    // 需先綁定自己的 Apify 金鑰（抓取靠它，計費也算在自己帳上）
    const apify = await hasApifyCredentials(user.id).catch(() => ({ bound: false }));
    if (!apify.bound) {
      return NextResponse.json({ ok: false, error: "請先到帳號管理綁定自己的 Apify 金鑰，才能新增監看來源" }, { status: 403 });
    }

    const body = await req.json();
    const searchQuery = body.search_query ? String(body.search_query).trim() : "";
    const sourceUsername = body.source_username ? String(body.source_username).trim() : "";
    if (!body.threads_account_id || (!sourceUsername && !searchQuery)) {
      return NextResponse.json(
        { ok: false, error: "缺少 threads_account_id，且 source_username／search_query 至少要填一個" },
        { status: 400 }
      );
    }
    const source = await createSource(
      {
        threads_account_id: body.threads_account_id,
        shopee_account_id: body.shopee_account_id || null,
        source_username: sourceUsername,
        search_query: searchQuery || null,
        poll_interval_minutes:
          body.poll_interval_minutes && Number(body.poll_interval_minutes) > 0
            ? Number(body.poll_interval_minutes)
            : undefined,
        auto_publish: Boolean(body.auto_publish),
        posts_limit: body.posts_limit && Number(body.posts_limit) > 0 ? Number(body.posts_limit) : undefined
      },
      user.id
    );
    return NextResponse.json({ ok: true, source });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
