import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createRedirectLink } from "@/lib/redirect-store";

export const dynamic = "force-dynamic";

// 建立 go2read 短連結（owner 限定登入者）。body: { sourceUrl, affiliateUrl?, title?, imageUrl?, description? }
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "請先登入" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const sourceUrl = typeof body.sourceUrl === "string" ? body.sourceUrl.trim() : "";
    if (!sourceUrl) return NextResponse.json({ ok: false, error: "請填來源網址" }, { status: 400 });

    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    const code = await createRedirectLink(user.id, {
      sourceUrl,
      affiliateUrl: str(body.affiliateUrl),
      title: str(body.title),
      imageUrl: str(body.imageUrl),
      description: str(body.description)
    });
    return NextResponse.json({ ok: true, code });
  } catch (e) {
    // createRedirectLink 對非法/內網 URL 會丟錯（SSRF 守衛）→ 對外回 400
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
