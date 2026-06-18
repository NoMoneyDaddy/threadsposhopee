import { NextResponse } from "next/server";
import { getMaterial, createDraftFromMaterial } from "@/lib/store";

export const dynamic = "force-dynamic";

// 重發：從既有素材再產生一篇草稿（重用文案/連結/媒體，不重燒 token）。
// body: { material_id, threads_account_id, status? }
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body.material_id || !body.threads_account_id) {
      return NextResponse.json({ ok: false, error: "缺少 material_id 或 threads_account_id" }, { status: 400 });
    }
    const material = await getMaterial(body.material_id);
    if (!material) return NextResponse.json({ ok: false, error: "找不到素材" }, { status: 404 });

    const draft = await createDraftFromMaterial(material, {
      threads_account_id: body.threads_account_id,
      // 重發預設進審核佇列，要直接發可帶 status:"approved"
      status: body.status === "approved" ? "approved" : "draft"
    });
    return NextResponse.json({ ok: true, draft });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
