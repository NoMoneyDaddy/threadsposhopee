import { NextResponse } from "next/server";
import { updateDraftStatus, listDrafts } from "@/lib/store";
import { isDemoMode } from "@/lib/env";

export const dynamic = "force-dynamic";

// 草稿審核動作：approve / reject / publish
export async function POST(req: Request) {
  const { id, action } = await req.json();
  if (!id || !action) {
    return NextResponse.json({ ok: false, error: "缺少 id 或 action" }, { status: 400 });
  }

  if (action === "reject") {
    await updateDraftStatus(id, "rejected");
    return NextResponse.json({ ok: true });
  }

  if (action === "approve") {
    await updateDraftStatus(id, "approved");
    return NextResponse.json({ ok: true });
  }

  if (action === "publish") {
    // Demo 模式：直接標記為已發布（不打 Threads API）
    if (isDemoMode) {
      await updateDraftStatus(id, "published", { published_post_id: "demo_" + Date.now() });
      return NextResponse.json({ ok: true, demo: true });
    }

    // 正式模式：交給發布服務（需要解密 token、Cloudinary 中轉等）
    await updateDraftStatus(id, "publishing");
    try {
      const draft = (await listDrafts()).find((d) => d.id === id);
      if (!draft) throw new Error("找不到草稿");
      // TODO: 取出 threads_account token、Cloudinary 中轉媒體後呼叫 publishToThreads()
      // 這裡先保守標記，待帳號憑證接上後啟用真實發布。
      await updateDraftStatus(id, "approved");
      return NextResponse.json({ ok: true, note: "已核准，待接上 Threads 憑證後自動發布" });
    } catch (e: any) {
      await updateDraftStatus(id, "failed", { error: e.message });
      return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: false, error: "未知動作" }, { status: 400 });
}
