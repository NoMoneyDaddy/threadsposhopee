import { NextResponse } from "next/server";
import { deleteSource, setSourceEnabled, setSourceAutoPublish, getSource } from "@/lib/store";
import { getCurrentUser, type AppUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 任何登入者皆可操作「自己的」來源；多租戶隔離由 store 以 owner_id 過濾保證（只動得到自己的列）。
async function requireUser(): Promise<{ user: AppUser; error: null } | { user: null; error: NextResponse }> {
  const user = await getCurrentUser();
  if (!user) return { user: null, error: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }) };
  return { user, error: null };
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const ownerRes = await requireUser();
  if (ownerRes.error) return ownerRes.error;
  const ok = await deleteSource(params.id, ownerRes.user.id);
  if (!ok) return NextResponse.json({ ok: false, error: "找不到來源或無權限" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

// 更新來源：啟用／停用（停用後抓取跳過），或切換「免審直接排程」。
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const ownerRes = await requireUser();
  if (ownerRes.error) return ownerRes.error;
  const body = await req.json().catch(() => ({}));
  let ok: boolean;
  if (typeof body.auto_publish === "boolean") {
    // 開啟免審直發前確認來源已綁發文帳號，否則 pipeline 會建出無帳號可發的 approved 草稿、卡在佇列。
    if (body.auto_publish === true) {
      const src = await getSource(params.id, ownerRes.user.id);
      if (!src) return NextResponse.json({ ok: false, error: "找不到來源或無權限" }, { status: 404 });
      if (!src.threads_account_id) {
        return NextResponse.json({ ok: false, error: "此來源未綁定發文帳號，無法開啟免審直接排程" }, { status: 400 });
      }
    }
    ok = await setSourceAutoPublish(params.id, ownerRes.user.id, body.auto_publish);
  } else if (typeof body.enabled === "boolean") {
    ok = await setSourceEnabled(params.id, ownerRes.user.id, body.enabled);
  } else {
    return NextResponse.json({ ok: false, error: "enabled 或 auto_publish 必須是 boolean" }, { status: 400 });
  }
  if (!ok) return NextResponse.json({ ok: false, error: "找不到來源或無權限" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
