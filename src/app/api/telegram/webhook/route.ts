import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getOwnerByTelegramChatId, getDraft, updateDraftStatus } from "@/lib/store";
import { answerTelegramCallback, editTelegramMessageText, sendTelegram } from "@/lib/notify";
import { TG_APPROVE_PREFIX, TG_REJECT_PREFIX } from "@/services/telegram/review";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Telegram 遠端審核 webhook（平台共用機器人）。
// 安全：設了 TELEGRAM_WEBHOOK_SECRET 時，驗證 Telegram 帶的 X-Telegram-Bot-Api-Secret-Token，擋偽造請求；
// 授權：以 callback 來源 chat 反查綁定的使用者，且只查得到「自己的」草稿，無法越權核准他人草稿。
// 一律回 200（非 200 會讓 Telegram 不斷重送）。
export async function POST(req: Request) {
  const token = env.telegramBotToken;
  if (!token) return NextResponse.json({ ok: true }); // 未啟用，直接忽略

  if (env.telegramWebhookSecret) {
    const got = req.headers.get("x-telegram-bot-api-secret-token");
    if (got !== env.telegramWebhookSecret) {
      log.warn("Telegram webhook secret 不符，忽略");
      return NextResponse.json({ ok: true });
    }
  }

  const update = await req.json().catch(() => null);
  if (!update || typeof update !== "object") return NextResponse.json({ ok: true });

  try {
    // 1) 審核按鈕：callback_query
    const cb = (update as { callback_query?: unknown }).callback_query as
      | { id: string; data?: string; message?: { message_id: number; chat?: { id: number } } }
      | undefined;
    if (cb?.id) {
      const data = typeof cb.data === "string" ? cb.data : "";
      const chatId = cb.message?.chat?.id;
      const messageId = cb.message?.message_id;
      if (chatId == null) {
        await answerTelegramCallback(token, cb.id, "無法辨識來源");
        return NextResponse.json({ ok: true });
      }
      const ownerId = await getOwnerByTelegramChatId(String(chatId));
      if (!ownerId) {
        await answerTelegramCallback(token, cb.id, "此 Telegram 尚未綁定帳號");
        return NextResponse.json({ ok: true });
      }
      const isApprove = data.startsWith(TG_APPROVE_PREFIX);
      const isReject = data.startsWith(TG_REJECT_PREFIX);
      if (!isApprove && !isReject) {
        await answerTelegramCallback(token, cb.id, "未知指令");
        return NextResponse.json({ ok: true });
      }
      const draftId = data.slice(4);
      const draft = await getDraft(draftId, ownerId); // 以 owner 過濾＝只動得到自己的草稿
      if (!draft) {
        await answerTelegramCallback(token, cb.id, "找不到草稿（可能已刪除）");
        return NextResponse.json({ ok: true });
      }
      if (draft.status !== "draft") {
        await answerTelegramCallback(token, cb.id, `已處理過（目前：${draft.status}）`);
        return NextResponse.json({ ok: true });
      }
      await updateDraftStatus(draftId, isApprove ? "approved" : "rejected", {}, ownerId);
      const resultText = isApprove ? "✅ 已核准，將依發文節奏排入佇列。" : "🗑 已駁回。";
      await answerTelegramCallback(token, cb.id, isApprove ? "已核准" : "已駁回");
      if (messageId != null) {
        const head = draft.product_name ? `🛒 ${draft.product_name}\n` : "";
        await editTelegramMessageText(token, chatId, messageId, `${head}${resultText}`);
      }
      return NextResponse.json({ ok: true });
    }

    // 2) /start 或任意訊息：回覆 chat id，方便使用者貼到網站「Telegram 通知」設定完成綁定。
    const msg = (update as { message?: unknown }).message as
      | { chat?: { id: number }; text?: string }
      | undefined;
    if (msg?.chat?.id != null) {
      await sendTelegram(
        token,
        String(msg.chat.id),
        `你的 Chat ID 是：${msg.chat.id}\n請到網站「設定 → Telegram 通知」貼上此 ID 完成綁定，之後待審草稿會直接推到這裡，可一鍵核准／駁回。`
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error("Telegram webhook 處理失敗", { err: e instanceof Error ? e.message : e });
    return NextResponse.json({ ok: true }); // 仍回 200，避免 Telegram 重送風暴
  }
}
