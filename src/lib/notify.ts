import { env } from "./env";
import { fetchWithTimeout } from "./http";
import { assertSafePublicUrl } from "./url-guard";
import { log } from "./logger";
import { getUserTelegramChatId, getUserDiscordWebhook, getNotifyPrefs } from "./store";
import type { NotifyType } from "./notify-prefs";

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

// 共用底層：對 Discord webhook 發訊（POST {content}）。URL 來自使用者，先過 SSRF 守衛。
// 絕不丟錯。回傳是否成功（供「測試」按鈕判斷）。
export async function sendDiscord(webhookUrl: string, text: string): Promise<boolean> {
  try {
    const safe = assertSafePublicUrl(webhookUrl).href;
    const res = await fetchWithTimeout(
      safe,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: text }) },
      8000
    );
    if (!res.ok) {
      log.warn("Discord webhook 非 2xx", { status: res.status });
      return false;
    }
    return true;
  } catch (e) {
    log.warn("Discord webhook 失敗", { err: e instanceof Error ? e.message : e });
    return false;
  }
}

// 個人通知：發到某使用者自綁的所有通道（Telegram + Discord，各自選配）。
// 未綁任何通道 → 靜默略過（個人通知為選配，缺了不該報錯）。並行送、互不影響。
export async function sendUserAlert(
  ownerId: string | null | undefined,
  text: string,
  type?: NotifyType
): Promise<void> {
  if (!ownerId) return;
  // 個別開關：有指定類型且使用者關掉該類 → 不送（無類型＝系統訊息照送）。
  if (type) {
    const prefs = await getNotifyPrefs(ownerId).catch(() => null);
    if (prefs && prefs[type] === false) return;
  }
  const [chatId, discordUrl] = await Promise.all([
    getUserTelegramChatId(ownerId).catch(() => null),
    getUserDiscordWebhook(ownerId).catch(() => null)
  ]);
  const jobs: Promise<unknown>[] = [];
  if (chatId && env.telegramBotToken) jobs.push(sendTelegram(env.telegramBotToken, chatId, text));
  if (discordUrl) jobs.push(sendDiscord(discordUrl, text));
  await Promise.all(jobs);
}
