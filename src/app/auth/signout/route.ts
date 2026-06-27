import { NextResponse } from "next/server";
import { getSessionClient } from "@/lib/supabase/clients";

export async function POST() {
  const sb = getSessionClient();
  await sb.auth.signOut();
  // 用相對路徑 Location：瀏覽器會依實際對外網址解析，反代後也不會跳到內部 localhost；
  // 同時不信任可被偽造的 x-forwarded-* 標頭（避免 open redirect／host header injection）。
  return new NextResponse(null, { status: 303, headers: { Location: "/login" } });
}

