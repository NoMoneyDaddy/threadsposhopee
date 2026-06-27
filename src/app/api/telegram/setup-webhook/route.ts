import { NextResponse } from "next/server";
import { getRealUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { setTelegramWebhook, getTelegramWebhookInfo } from "@/lib/notify";

export const dynamic = "force-dynamic";

// 一鍵設定／查詢平台共用 bot 的 Telegram webhook（owner 專屬）。
// deeplink 綁定與遠端審核都靠這個 webhook 收訊；未註冊或 secret 不符時 bot 不會有任何回應。

// 取對外網址：反向代理後 req.url 是內部位址，優先用 x-forwarded-* 還原對外網域。
function publicOrigin(req: Request): string {
  const fwdHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const fwdProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return fwdHost ? `${fwdProto || "https"}://${fwdHost}` : new URL(req.url).origin;
}

// 查詢目前 webhook 狀態（顯示用）。
export async function GET() {
  const user = await getRealUser();
  if (!user?.isPlatformOwner) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!env.telegramBotToken) return NextResponse.json({ ok: true, botConfigured: false });
  const secretSet = Boolean(env.telegramWebhookSecret);
  const info = await getTelegramWebhookInfo(env.telegramBotToken);
  return NextResponse.json({ ok: true, botConfigured: true, secretSet, info });
}

// 註冊 webhook 到「目前這個網域」。
export async function POST(req: Request) {
  const user = await getRealUser();
  if (!user?.isPlatformOwner) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!env.telegramBotToken) {
    return NextResponse.json({ ok: false, error: "尚未設定 TELEGRAM_BOT_TOKEN" }, { status: 400 });
  }
  if (!env.telegramWebhookSecret) {
    return NextResponse.json(
      { ok: false, error: "尚未設定 TELEGRAM_WEBHOOK_SECRET：webhook 需要此密鑰驗證請求，請先在環境變數設定並重新部署" },
      { status: 400 }
    );
  }
  const webhookUrl = `${publicOrigin(req)}/api/telegram/webhook`;
  const r = await setTelegramWebhook(env.telegramBotToken, webhookUrl, env.telegramWebhookSecret);
  if (!r.ok) {
    return NextResponse.json({ ok: false, error: r.description || "Telegram setWebhook 失敗", webhookUrl }, { status: 502 });
  }
  return NextResponse.json({ ok: true, webhookUrl });
}
