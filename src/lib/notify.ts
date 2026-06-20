import { env } from "./env";
import { fetchWithTimeout } from "./http";
import { log } from "./logger";

// 失敗告警：設定了 TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID 才送。
// 用於 cron 失敗等運維可見性，本身絕不丟錯（告警失敗不該再炸上層）。
// 未設通道時不靜默：改落結構化 error log，確保告警內容在 log 層仍留痕（運維可見）。
export async function sendAlert(text: string): Promise<void> {
  if (!env.telegramBotToken || !env.telegramChatId) {
    log.error("[ALERT]（未設定通知通道，僅記錄）", { alert: text });
    return;
  }
  try {
    await fetchWithTimeout(
      `https://api.telegram.org/bot${env.telegramBotToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: env.telegramChatId, text, disable_web_page_preview: true })
      },
      8000
    );
  } catch (e) {
    log.error("sendAlert 失敗", { err: e instanceof Error ? e.message : e });
  }
}
