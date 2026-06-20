import { NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { getUserDiscordWebhook, setUserDiscordWebhook } from "@/lib/store";
import { sendDiscord } from "@/lib/notify";
import { getCurrentUser } from "@/lib/auth";
import { assertSafePublicUrl } from "@/lib/url-guard";

export const dynamic = "force-dynamic";

// 綁定／解除個人 Discord 通知。綁定時發測試訊息確認可達。
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));

  if (body.unbind === true) {
    try {
      await setUserDiscordWebhook(user.id, null);
      return NextResponse.json({ ok: true, bound: false });
    } catch (e) {
      log.error("解除 Discord 綁定失敗", { ownerId: user.id, err: e });
      return NextResponse.json({ ok: false, error: "解除失敗，請稍後再試" }, { status: 500 });
    }
  }

  const url = typeof body.url === "string" ? body.url.trim() : "";
  // 必須是合法、非內網的 https Discord webhook（SSRF 守衛 + 網域限定，避免被當成打內網/任意站的跳板）。
  let safe: URL;
  try {
    safe = assertSafePublicUrl(url);
  } catch {
    return NextResponse.json({ ok: false, error: "webhook URL 無效或不被允許" }, { status: 400 });
  }
  if (safe.protocol !== "https:" || !/(^|\.)discord(app)?\.com$/i.test(safe.hostname)) {
    return NextResponse.json({ ok: false, error: "請貼上 Discord webhook 連結（https://discord.com/api/webhooks/...）" }, { status: 400 });
  }
  // 先發測試訊息：成功才綁定，避免存到無效 webhook。
  const tested = await sendDiscord(url, "✅ ThreadsPoShopee 個人通知已連結到此 Discord 頻道。");
  if (!tested) {
    return NextResponse.json({ ok: false, error: "測試訊息送不出去：請確認 webhook 連結正確且未被刪除" }, { status: 400 });
  }
  try {
    await setUserDiscordWebhook(user.id, url);
    return NextResponse.json({ ok: true, bound: true });
  } catch (e) {
    log.error("綁定 Discord webhook 失敗", { ownerId: user.id, err: e });
    return NextResponse.json({ ok: false, error: "綁定失敗，請稍後再試" }, { status: 500 });
  }
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const url = await getUserDiscordWebhook(user.id).catch(() => null);
  return NextResponse.json({ ok: true, bound: Boolean(url) });
}
