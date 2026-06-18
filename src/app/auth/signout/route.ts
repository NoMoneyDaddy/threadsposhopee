import { NextResponse } from "next/server";
import { getSessionClient } from "@/lib/supabase/clients";

export async function POST(req: Request) {
  const sb = getSessionClient();
  await sb.auth.signOut();
  return NextResponse.redirect(new URL("/login", req.url), { status: 303 });
}
