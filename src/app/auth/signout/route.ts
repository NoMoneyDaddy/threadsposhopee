import { NextResponse } from "next/server";
import { getSessionClient } from "@/lib/supabase/clients";

export async function POST(req: Request) {
  const sb = getSessionClient();
  await sb.auth.signOut();
  // 反向代理後 req.url 是內部位址（localhost），改用 x-forwarded-* 還原對外網域，避免登出跳到 localhost。
  const fwdHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const fwdProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const url = new URL(req.url);
  const origin = fwdHost ? `${fwdProto || "https"}://${fwdHost}` : url.origin;
  return NextResponse.redirect(new URL("/login", origin), { status: 303 });
}

