import { NextResponse } from "next/server";
import { deleteMaterial, updateMaterialMedia, updateMaterialContent } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";
import { sanitizeMaterialMedia, sanitizeThreadSegments } from "@/lib/material-media";
import { errMessage } from "@/lib/api-error";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

// 素材 id 為 UUID（資料表主鍵）。在入口先驗證格式，避免把無效輸入帶進刪除邏輯。
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_TEXT = 5000; // 主文/留言文案長度上限（防止異常大量輸入）。

// 更新素材：媒體清單（逐張 slot：main/reply/both）和／或文案（主文／留言）。
// 至少需帶 media 陣列或 main_text/reply_text 其一。多租戶由 store 以 owner_id 過濾保證。
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const id = params.id;
  if (!id || !UUID_RE.test(id)) return NextResponse.json({ ok: false, error: "素材 id 格式不正確" }, { status: 400 });
  const body = await req.json().catch(() => ({}));

  const hasMedia = Array.isArray(body?.media);
  const hasMain = typeof body?.main_text === "string";
  const hasReply = typeof body?.reply_text === "string";
  const hasChain = Array.isArray(body?.thread_chain);
  if (!hasMedia && !hasMain && !hasReply && !hasChain) {
    return NextResponse.json({ ok: false, error: "缺少要更新的欄位（media / main_text / reply_text / thread_chain）" }, { status: 400 });
  }
  const chainTextTooLong =
    hasChain &&
    (body.thread_chain as unknown[]).some((seg) => {
      const t = (seg as { text?: unknown } | null)?.text;
      return typeof t === "string" && t.length > MAX_TEXT;
    });
  if ((hasMain && body.main_text.length > MAX_TEXT) || (hasReply && body.reply_text.length > MAX_TEXT) || chainTextTooLong) {
    return NextResponse.json({ ok: false, error: "文案過長" }, { status: 400 });
  }

  try {
    if (hasMain || hasReply || hasChain) {
      const updated = await updateMaterialContent(id, user.id, {
        ...(hasMain ? { main_text: body.main_text } : {}),
        ...(hasReply ? { reply_text: body.reply_text } : {}),
        ...(hasChain ? { thread_chain: sanitizeThreadSegments(body.thread_chain) } : {})
      });
      if (!updated) return NextResponse.json({ ok: false, error: "找不到素材或無權限" }, { status: 404 });
    }
    if (hasMedia) {
      const media = sanitizeMaterialMedia(body.media);
      const ok = await updateMaterialMedia(id, user.id, media);
      if (!ok) return NextResponse.json({ ok: false, error: "找不到素材或無權限" }, { status: 404 });
      return NextResponse.json({ ok: true, media });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error("更新素材失敗", { materialId: id, ownerId: user.id, err: e });
    return NextResponse.json({ ok: false, error: errMessage(e) }, { status: 500 });
  }
}

// 刪除自己的素材（多租戶隔離由 store 以 owner_id 過濾保證，只刪得到自己的）。
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const id = params.id;
  if (!id || !UUID_RE.test(id)) return NextResponse.json({ ok: false, error: "素材 id 格式不正確" }, { status: 400 });
  try {
    const ok = await deleteMaterial(id, user.id);
    if (!ok) return NextResponse.json({ ok: false, error: "找不到素材或無權限" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error("刪除素材失敗", { materialId: id, ownerId: user.id, err: e });
    return NextResponse.json({ ok: false, error: "刪除素材時發生問題，請稍後再試" }, { status: 500 });
  }
}
