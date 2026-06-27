import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getOwnerByTelegramChatId, getDraft, updateDraftStatus, setUserTelegramChatId } from "@/lib/store";
import { answerTelegramCallback, editTelegramMessageText, sendTelegram } from "@/lib/notify";
import { parseStartPayload, consumeBindToken } from "@/lib/telegram-bind";
import { TG_APPROVE_PREFIX, TG_REJECT_PREFIX } from "@/services/telegram/review";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Telegram 遠端審核 webhook（平台共用機器人）。
// 安全：TELEGRAM_WEBHOOK_SECRET 為必要防護——未設或標頭 X-Telegram-Bot-Api-Secret-Token 不符一律拒收（fail-closed）；
// 授權：以 callback 來源 chat 反查綁定的使用者，且只查得到「自己的」草稿，無法越權核准他人草稿。
// 一律回 200（非 200 會讓 Telegram 不斷重送）。
export async function POST(req: Request) {
  const token = env.telegramBotToken;
  if (!token) return NextResponse.json({ ok: true }); // 未啟用，直接忽略

  // Fail-closed：webhook 為公開端點，未設 secret 時一律拒收（否則外部可偽造 callback 替人核准/駁回草稿）。
  if (!env.telegramWebhookSecret) {
    log.error("Telegram webhook 未設 TELEGRAM_WEBHOOK_SECRET，拒收（請設定後重新 setWebhook）");
    return NextResponse.json({ ok: true });
  }
  if (req.headers.get("x-telegram-bot-api-secret-token") !== env.telegramWebhookSecret) {
    log.warn("Telegram webhook secret 不符，忽略");
    return NextResponse.json({ ok: true });
  }

  const update = await req.json().catch(() => null);
  if (!update || typeof update !== "object") return NextResponse.json({ ok: true });

  // callback id 提到外層：例外路徑也要回應 callback，否則 Telegram 客戶端按鈕會一直轉圈。
  let cbId: string | undefined;
  try {
    // 1) 審核按鈕：callback_query
    const cb = (update as { callback_query?: unknown }).callback_query as
      | { id: string; from?: { id: number }; data?: string; message?: { message_id: number; chat?: { id: number } } }
      | undefined;
    if (cb?.id) {
      cbId = cb.id;
      const data = typeof cb.data === "string" ? cb.data : "";
      const chatId = cb.message?.chat?.id;
      const messageId = cb.message?.message_id;
      if (chatId == null) {
        await answerTelegramCallback(token, cb.id, "無法辨識來源");
        return NextResponse.json({ ok: true });
      }
      // 防越權：只允許「私聊」遠端審核。群組 chat id 為負、且多人共用＝任一成員都能替 owner 核准；
      // 私聊時 from.id === chat.id，群組／頻道則不符 → 一律拒絕，避免綁到群組造成跨人核准。
      if (chatId < 0 || cb.from?.id !== chatId) {
        await answerTelegramCallback(token, cb.id, "請在與 bot 的私聊中審核（不支援群組）");
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
      const draftId = data.slice((isApprove ? TG_APPROVE_PREFIX : TG_REJECT_PREFIX).length);
      // 信任邊界輸入驗證：draftId 來自不可信的 callback data，須為 UUID 才查 DB（擋畸形 id／濫用請求）。
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(draftId)) {
        await answerTelegramCallback(token, cb.id, "草稿 id 格式錯誤");
        return NextResponse.json({ ok: true });
      }
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

    // 2) 僅 /start 指令才回覆（避免被加進群組後對每則訊息/貼圖/服務訊息洗版、觸發 rate limit）。
    const msg = (update as { message?: unknown }).message as
      | { chat?: { id: number; type?: string }; text?: string }
      | undefined;
    if (msg?.chat?.id != null && typeof msg.text === "string" && msg.text.startsWith("/start")) {
      const chatId = msg.chat.id;
      const payload = parseStartPayload(msg.text);
      // 2a) 帶綁定碼的 deeplink（/start <token>）：以綁定碼反查使用者，自動寫入其 chat_id。
      if (payload) {
        // 僅私聊可綁定：群組 chat id 為負，多人共用會讓他人收到你的草稿並可代為核准。
        if (chatId < 0 || (msg.chat.type && msg.chat.type !== "private")) {
          await sendTelegram(token, String(chatId), "請在與 bot 的「私聊」中綁定（不支援群組）。");
          return NextResponse.json({ ok: true });
        }
        const ownerId = await consumeBindToken(payload);
        if (!ownerId) {
          await sendTelegram(token, String(chatId), "綁定連結已失效或不正確，請回網站重新產生「一鍵綁定」連結。");
          return NextResponse.json({ ok: true });
        }
        try {
          await setUserTelegramChatId(ownerId, String(chatId));
          await sendTelegram(token, String(chatId), "✅ 已完成綁定，之後待審草稿與重要提醒會直接推到這裡，可一鍵核准／駁回。");
        } catch (e) {
          // telegram_chat_id 唯一索引：此 chat 已綁其他帳號時會衝突。
          log.warn("Telegram deeplink 綁定寫入失敗", { err: e instanceof Error ? e.message : e });
          await sendTelegram(token, String(chatId), "綁定失敗：此 Telegram 可能已綁定其他帳號。請先在原帳號解除，或改用其他 Telegram。");
        }
        return NextResponse.json({ ok: true });
      }
      // 2b) 純 /start（無綁定碼）：回覆 chat id 作為後備（仍可手動貼到設定頁）。
      // 僅私聊回覆 id：群組 chat id 為負／type 非 private，回傳會誘導使用者綁群組，導致私人通知洩漏給群成員。
      if (chatId < 0 || (msg.chat.type && msg.chat.type !== "private")) {
        await sendTelegram(token, String(chatId), "個人通知僅支援私聊。請在與 bot 的私聊中按 /start，或用網站「一鍵綁定」。");
        return NextResponse.json({ ok: true });
      }
      await sendTelegram(
        token,
        String(chatId),
        `你的 Chat ID 是：${chatId}\n建議改用網站「設定 → Telegram 通知 → 一鍵綁定」更方便；或將此 ID 貼回設定頁完成綁定。`
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error("Telegram webhook 處理失敗", { err: e instanceof Error ? e.message : e });
    // 若是審核按鈕觸發的例外（如 DB 查詢拋錯），回應 callback 讓按鈕停止轉圈、給使用者可見回饋。
    if (cbId) await answerTelegramCallback(token, cbId, "處理失敗，請稍後再試").catch(() => {});
    return NextResponse.json({ ok: true }); // 仍回 200，避免 Telegram 重送風暴
  }
}
