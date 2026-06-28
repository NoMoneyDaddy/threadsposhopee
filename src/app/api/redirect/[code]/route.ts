import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { updateRedirectLink, deleteRedirectLink } from "@/lib/redirect-store";
import { assertSafePublicUrl } from "@/lib/url-guard";
import { apiError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

// 短碼格式（信任邊界：route param 為不可信輸入；對齊 shortcode 字母表的字元集與寬鬆長度上限，擋畸形/濫用）。
const CODE_RE = /^[a-z0-9]{1,32}$/i;

// 編輯短連結目的地/標題（短碼不變）。多租戶隔離由 store 以 owner_id 過濾保證。
// body: { sourceUrl, title? }
export async function PATCH(req: Request, { params }: { params: { code: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "請先登入" }, { status: 401 });
  if (!CODE_RE.test(params.code)) return NextResponse.json({ ok: false, error: "短碼格式錯誤" }, { status: 400 });

  // body 為字面 "null" 時 req.json() 會回 null（繞過 catch），故再補 || {} 確保是物件。
  const body = (await req.json().catch(() => ({}))) || {};
  const sourceUrl = typeof body.sourceUrl === "string" ? body.sourceUrl.trim() : "";
  if (!sourceUrl) return NextResponse.json({ ok: false, error: "請填來源網址" }, { status: 400 });
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

  // 先做 URL 驗證（SSRF/協定/格式）→ 屬使用者輸入錯誤，回 400。
  try {
    assertSafePublicUrl(sourceUrl);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "網址不安全或格式錯誤" }, { status: 400 });
  }

  // DB 寫入失敗屬伺服器錯誤 → 收斂為 500 + 固定文案（細節只進 log，不洩漏 PostgREST 內部訊息）。
  let found: boolean;
  try {
    found = await updateRedirectLink(params.code, user.id, { sourceUrl, title: str(body.title) });
  } catch (e) {
    return apiError("updateRedirectLink failed", e);
  }
  if (!found) return NextResponse.json({ ok: false, error: "找不到短連結或無權限" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

// 刪除短連結（多租戶：只刪得到自己的）。永遠回 JSON（含失敗），讓前端可安全 res.json()。
export async function DELETE(_req: Request, { params }: { params: { code: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "請先登入" }, { status: 401 });
  if (!CODE_RE.test(params.code)) return NextResponse.json({ ok: false, error: "短碼格式錯誤" }, { status: 400 });
  let found: boolean;
  try {
    found = await deleteRedirectLink(params.code, user.id);
  } catch (e) {
    return apiError("deleteRedirectLink failed", e);
  }
  if (!found) return NextResponse.json({ ok: false, error: "找不到短連結或無權限" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
