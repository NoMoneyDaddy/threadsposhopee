import { NextResponse } from "next/server";
import { deleteMaterial, updateMaterialMedia } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";
import { sanitizeMaterialMedia } from "@/lib/material-media";
import { errMessage } from "@/lib/api-error";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

// 素材 id 為 UUID（資料表主鍵）。在入口先驗證格式，避免把無效輸入帶進刪除邏輯。
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 更新素材媒體清單（逐張 slot：main/reply/both）。多租戶由 store 以 owner_id 過濾保證。
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const id = params.id;
  if (!id || !UUID_RE.test(id)) return NextResponse.json({ ok: false, error: "素材 id 格式不正確" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  if (!Array.isArray(body?.media)) return NextResponse.json({ ok: false, error: "缺少 media 陣列" }, { status: 400 });
  const media = sanitizeMaterialMedia(body.media);
  try {
    const ok = await updateMaterialMedia(id, user.id, media);
    if (!ok) return NextResponse.json({ ok: false, error: "找不到素材或無權限" }, { status: 404 });
    return NextResponse.json({ ok: true, media });
  } catch (e) {
    log.error("更新素材媒體失敗", { materialId: id, ownerId: user.id, err: e });
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
