import { NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { getCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { createBindToken } from "@/lib/telegram-bind";
import { getTelegramBotUsername } from "@/lib/notify";

export const dynamic = "force-dynamic";

// 產生 Telegram 一鍵綁定 deeplink：登入使用者 → 一次性綁定碼 → https://t.me/<bot>?start=<碼>。
// 使用者按 START 後，webhook 會以綁定碼反查此使用者並自動寫入其 chat_id。
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!env.telegramBotToken) {
    return NextResponse.json({ ok: false, error: "系統未設定 Telegram bot，請聯絡管理員" }, { status: 400 });
  }
  const username = await getTelegramBotUsername(env.telegramBotToken);
  if (!username) {
    return NextResponse.json({ ok: false, error: "暫時無法取得 bot 資訊，請稍後再試" }, { status: 502 });
  }
  try {
    const token = await createBindToken(user.id);
    return NextResponse.json({ ok: true, url: `https://t.me/${username}?start=${token}` });
  } catch (e) {
    log.error("建立 Telegram 綁定 deeplink 失敗", { ownerId: user.id, err: e });
    return NextResponse.json({ ok: false, error: "建立綁定連結失敗，請稍後再試" }, { status: 500 });
  }
}
