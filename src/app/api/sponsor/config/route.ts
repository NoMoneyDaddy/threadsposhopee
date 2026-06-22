import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { setSponsorConfig, normalizeSponsorConfig } from "@/lib/sponsor";

export const dynamic = "force-dynamic";

// owner 限定：設定贊助文（平台分潤連結／冷門時段／開關）。
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!user.isOwner) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const norm = normalizeSponsorConfig(body);
  if (!norm.ok) return NextResponse.json({ ok: false, error: norm.error }, { status: 400 });
  await setSponsorConfig(norm.cfg);
  return NextResponse.json({ ok: true, config: norm.cfg });
}
