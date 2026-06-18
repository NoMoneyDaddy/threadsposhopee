import { env } from "./env";
import { fetchWithTimeout } from "./http";

// 失敗告警：設定了 TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID 才會送，否則靜默略過。
// 用於 cron 失敗等運維可見性，本身絕不丟錯（告警失敗不該再炸上層）。
export async function sendAlert(text: string): Promise<void> {
  if (!env.telegramBotToken || !env.telegramChatId) return;
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
    console.error("sendAlert 失敗:", e instanceof Error ? e.message : e);
  }
}
