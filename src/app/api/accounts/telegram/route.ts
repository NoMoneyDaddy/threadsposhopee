import { NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { getUserTelegramChatId, setUserTelegramChatId } from "@/lib/store";
import { sendTelegram } from "@/lib/notify";
import { getCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

// 個人通知只綁「私聊」chat_id（正整數）；群組／頻道為負數，一律拒絕，避免私人通知洩漏給群成員。
const isValidChatId = (s: string) => /^\d{1,20}$/.test(s);

// 綁定／解除個人 Telegram 通知。綁定時發一則測試訊息確認可達。
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));

  if (body.unbind === true) {
    try {
      await setUserTelegramChatId(user.id, null);
      return NextResponse.json({ ok: true, bound: false });
    } catch (e) {
      log.error("解除 Telegram 綁定失敗", { ownerId: user.id, err: e });
      return NextResponse.json({ ok: false, error: "解除失敗，請稍後再試" }, { status: 500 });
    }
  }

  const chatId = typeof body.chatId === "string" ? body.chatId.trim() : "";
  if (!isValidChatId(chatId)) {
    return NextResponse.json(
      { ok: false, error: "只接受私聊 chat_id（正整數）；不支援群組／頻道（負數）" },
      { status: 400 }
    );
  }
  if (!env.telegramBotToken) {
    return NextResponse.json({ ok: false, error: "系統未設定 Telegram bot，請聯絡管理員" }, { status: 400 });
  }
  // 先發測試訊息：成功才綁定，避免存到「機器人無法送達」的 chat（使用者需先對 bot 按 Start）。
  const tested = await sendTelegram(env.telegramBotToken, chatId, "✅ IwantPo 個人通知已連結，之後重要提醒會送到這裡。");
  if (!tested) {
    return NextResponse.json(
      { ok: false, error: "測試訊息送不出去：請先在 Telegram 對本 bot 按 /start，並確認 chat_id 正確" },
      { status: 400 }
    );
  }
  try {
    await setUserTelegramChatId(user.id, chatId);
    return NextResponse.json({ ok: true, bound: true });
  } catch (e) {
    log.error("綁定 Telegram chat_id 失敗", { ownerId: user.id, err: e });
    return NextResponse.json({ ok: false, error: "綁定失敗，請稍後再試" }, { status: 500 });
  }
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const chatId = await getUserTelegramChatId(user.id).catch(() => null);
  return NextResponse.json({ ok: true, bound: Boolean(chatId), botConfigured: Boolean(env.telegramBotToken) });
}
