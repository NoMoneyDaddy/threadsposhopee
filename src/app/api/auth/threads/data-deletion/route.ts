import { NextResponse } from "next/server";
import { parseSignedRequest } from "@/services/threads/signed-request";
import { deleteThreadsAccountsByThreadsUserId } from "@/lib/store";
import { env, isDemoMode } from "@/lib/env";

export const dynamic = "force-dynamic";

// Meta 資料刪除請求回呼（Data Deletion Request Callback）：驗證 signed_request 後刪除該
// Threads 使用者資料，並依規回傳 { url, confirmation_code }（url 為可查詢的刪除狀態頁）。
export async function POST(req: Request) {
  // Meta 需要可對外存取的絕對網址；反向代理後 req.url 是內部位址，改用 x-forwarded-* 還原對外網域。
  const fwdHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const fwdProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const url = new URL(req.url);
  const origin = fwdHost ? `${fwdProto || "https"}://${fwdHost}` : url.origin;
  if (isDemoMode || !env.threadsAppSecret) {
    return NextResponse.json({ url: `${origin}/data-deletion`, confirmation_code: "demo" });
  }
  const form = await req.formData();
  const signed = String(form.get("signed_request") ?? "");
  const data = parseSignedRequest(signed, env.threadsAppSecret);
  if (!data?.user_id) return NextResponse.json({ ok: false }, { status: 400 });
  await deleteThreadsAccountsByThreadsUserId(data.user_id).catch(() => {});
  const code = data.user_id;
  return NextResponse.json({ url: `${origin}/data-deletion?id=${encodeURIComponent(code)}`, confirmation_code: code });
}
