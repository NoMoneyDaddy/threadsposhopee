import { NextResponse } from "next/server";
import { createShopeeAccount } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";
import { validateShopeeCredentials } from "@/services/shopee/affiliate";
import { apiError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const appId = typeof body.app_id === "string" ? body.app_id.trim() : "";
    const secret = typeof body.secret === "string" ? body.secret.trim() : "";
    if (!appId || !secret) {
      return NextResponse.json({ ok: false, error: "缺少 app_id / secret" }, { status: 400 });
    }
    const subId = typeof body.default_sub_id === "string" ? body.default_sub_id.trim() : "";
    // 綁定前驗證僅作提示、不阻擋存檔：避免蝦皮即時驗證（簽章/權限/限流）誤判把有效金鑰擋下而「無法儲存」。
    // 金鑰為使用者自己所有，存錯也只影響自己的連結產生（屆時會有明確錯誤可重設）。
    // 一人一組：createShopeeAccount 對既有帳號做覆寫（不另開新筆）。
    const check = await validateShopeeCredentials(appId, secret).catch(() => ({ ok: false as const, reason: "驗證時發生錯誤" }));
    const account = await createShopeeAccount(
      {
        app_id: appId,
        secret,
        default_sub_id: subId || undefined
      },
      user.id
    );
    return NextResponse.json({
      ok: true,
      account,
      warning: check.ok ? undefined : `已儲存，但金鑰驗證未通過（${check.reason ?? "請確認 App ID／Secret"}），若產生連結失敗請重新確認。`
    });
  } catch (e) {
    // 對外錯誤收斂（沿用 repo 慣例）：完整錯誤只進 server log，client 回固定文案，
    // 避免外洩 Supabase/PostgREST 內部細節，也不會出現 "[object Object]"（apiError 不直接序列化 e）。
    return apiError("綁定 Shopee 失敗", e, { clientMessage: "綁定失敗，請稍後再試" });
  }
}
