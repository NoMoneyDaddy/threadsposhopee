import { NextResponse } from "next/server";
import { parseSignedRequest } from "@/services/threads/signed-request";
import { deleteThreadsAccountsByThreadsUserId } from "@/lib/store";
import { env, isDemoMode } from "@/lib/env";

export const dynamic = "force-dynamic";

// Meta 解除授權回呼（Uninstall Callback）：使用者把本 App 從其 Threads 帳號移除時通知 →
// 驗證 signed_request 後刪除我們存的該帳號 token。由 Meta 伺服器呼叫，無使用者 session。
export async function POST(req: Request) {
  if (isDemoMode || !env.threadsAppSecret) return NextResponse.json({ ok: true });
  const form = await req.formData();
  const signed = String(form.get("signed_request") ?? "");
  const data = parseSignedRequest(signed, env.threadsAppSecret);
  if (!data?.user_id) return NextResponse.json({ ok: false }, { status: 400 });
  await deleteThreadsAccountsByThreadsUserId(data.user_id).catch(() => {});
  return NextResponse.json({ ok: true });
}
