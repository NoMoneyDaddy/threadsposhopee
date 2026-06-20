import { env } from "./env";
import { fetchWithTimeout } from "./http";
import { log } from "./logger";
import { getUserTelegramChatId } from "./store";

// 共用底層：對指定 chat 發 Telegram 訊息。回傳是否成功（供「測試」按鈕判斷）。
// 絕不丟錯（告警失敗不該再炸上層）。
export async function sendTelegram(botToken: string, chatId: string, text: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true })
      },
      8000
    );
    if (!res.ok) {
      log.warn("Telegram sendMessage 非 2xx", { status: res.status });
      return false;
    }
    return true;
  } catch (e) {
    log.warn("Telegram sendMessage 失敗", { err: e instanceof Error ? e.message : e });
    return false;
  }
}

// 運維告警（全域）：設了 TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID 才送，用於 cron 失敗等。
// 未設通道時不靜默：改落結構化 error log，確保告警內容在 log 層仍留痕（運維可見）。
export async function sendAlert(text: string): Promise<void> {
  if (!env.telegramBotToken || !env.telegramChatId) {
    log.error("[ALERT]（未設定通知通道，僅記錄）", { alert: text });
    return;
  }
  await sendTelegram(env.telegramBotToken, env.telegramChatId, text);
}

// 個人通知：發到某使用者自綁的 chat（用平台共用 bot token）。
// 未設 bot token 或該使用者未綁 chat → 靜默略過（個人通知為選配，缺了不該報錯）。
export async function sendUserAlert(ownerId: string | null | undefined, text: string): Promise<void> {
  if (!ownerId || !env.telegramBotToken) return;
  const chatId = await getUserTelegramChatId(ownerId).catch(() => null);
  if (!chatId) return;
  await sendTelegram(env.telegramBotToken, chatId, text);
}
