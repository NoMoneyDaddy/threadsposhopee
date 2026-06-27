import { NextResponse } from "next/server";
import { getRealUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { setTelegramWebhook, getTelegramWebhookInfo } from "@/lib/notify";

export const dynamic = "force-dynamic";

// 一鍵設定／查詢平台共用 bot 的 Telegram webhook（owner 專屬）。
// deeplink 綁定與遠端審核都靠這個 webhook 收訊；未註冊或 secret 不符時 bot 不會有任何回應。

// 取對外網址（要註冊進 Telegram，屬信任邊界）：
// 優先用瀏覽器送的 Origin——owner 由設定頁 POST，middleware 已對帶 Origin 的同源請求驗證過，
// 是最可信的對外來源；偽造的 x-forwarded-host 只在「無 Origin」（非瀏覽器）時才退而採用。
// 一律強制 https（Telegram webhook 規定），避免反向代理還原成 http 註冊失敗。
function publicOrigin(req: Request): string {
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).origin.replace(/^http:/, "https:");
    } catch {
      // 畸形 Origin → 落後備
    }
  }
  const fwdHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = fwdHost || req.headers.get("host")?.split(",")[0]?.trim();
  return host ? `https://${host}` : new URL(req.url).origin.replace(/^http:/, "https:");
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
  // Telegram 規定 webhook 必須 https；反向代理還原若得到 http 一律改為 https，避免註冊失敗。
  const webhookUrl = `${publicOrigin(req)}/api/telegram/webhook`.replace(/^http:/, "https:");
  const r = await setTelegramWebhook(env.telegramBotToken, webhookUrl, env.telegramWebhookSecret);
  if (!r.ok) {
    return NextResponse.json({ ok: false, error: r.description || "Telegram setWebhook 失敗", webhookUrl }, { status: 502 });
  }
  return NextResponse.json({ ok: true, webhookUrl });
}
