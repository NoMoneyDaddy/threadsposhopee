import { env } from "./env";
import { fetchWithTimeout } from "./http";
import { assertSafePublicUrl } from "./url-guard";
import { log } from "./logger";
import { getUserTelegramChatId, getNotifyPrefs } from "./store";
import { sendUserPush, isPushConfigured } from "./push";
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

// 取 bot 的 @username（組 deeplink 用）：呼叫 getMe，記憶體緩存（username 幾乎不變）。
// 依 botToken 分鍵緩存，避免 token 輪替／多 bot 時回到舊 username 組出錯的 deeplink。取不到回 null（呼叫端據此不提供一鍵綁定）。絕不丟錯。
const botUsernameCache = new Map<string, string>();
export async function getTelegramBotUsername(botToken: string): Promise<string | null> {
  const cached = botUsernameCache.get(botToken);
  if (cached) return cached;
  try {
    // 外呼一律走 SSRF 防線（即使 host 固定）：先過 assertSafePublicUrl，再 fetchWithTimeout。
    const url = assertSafePublicUrl(`https://api.telegram.org/bot${botToken}/getMe`).toString();
    const res = await fetchWithTimeout(url, {}, 8000);
    if (!res.ok) {
      log.warn("Telegram getMe 非 2xx", { status: res.status });
      return null;
    }
    const json = (await res.json()) as { ok?: boolean; result?: { username?: string } };
    const username = json?.result?.username;
    if (typeof username === "string" && username) {
      botUsernameCache.set(botToken, username);
      return username;
    }
    return null;
  } catch (e) {
    log.warn("Telegram getMe 失敗", { err: e instanceof Error ? e.message : e });
    return null;
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

// 共用底層：發 Telegram 訊息並附 inline 按鈕（遠端審核用）。buttons 為單列按鈕。
// callback_data 上限 64 bytes（Telegram 限制），呼叫端須自行控制長度。絕不丟錯。
export async function sendTelegramButtons(
  botToken: string,
  chatId: string,
  text: string,
  buttons: { text: string; data: string }[]
): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          disable_web_page_preview: true,
          reply_markup: { inline_keyboard: [buttons.map((b) => ({ text: b.text, callback_data: b.data }))] }
        })
      },
      8000
    );
    if (!res.ok) {
      log.warn("Telegram sendMessage(buttons) 非 2xx", { status: res.status });
      return false;
    }
    return true;
  } catch (e) {
    log.warn("Telegram sendMessage(buttons) 失敗", { err: e instanceof Error ? e.message : e });
    return false;
  }
}

// 回應 callback_query（讓按鈕轉圈停止、可跳提示）。絕不丟錯。
export async function answerTelegramCallback(botToken: string, callbackQueryId: string, text?: string): Promise<void> {
  try {
    await fetchWithTimeout(
      `https://api.telegram.org/bot${botToken}/answerCallbackQuery`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callback_query_id: callbackQueryId, text: text?.slice(0, 200) })
      },
      8000
    );
  } catch (e) {
    log.warn("Telegram answerCallbackQuery 失敗", { err: e instanceof Error ? e.message : e });
  }
}

// 審核後把按鈕訊息文字更新成結果（避免重複點擊）。絕不丟錯。
export async function editTelegramMessageText(
  botToken: string,
  chatId: string | number,
  messageId: number,
  text: string
): Promise<void> {
  try {
    await fetchWithTimeout(
      `https://api.telegram.org/bot${botToken}/editMessageText`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, disable_web_page_preview: true })
      },
      8000
    );
  } catch (e) {
    log.warn("Telegram editMessageText 失敗", { err: e instanceof Error ? e.message : e });
  }
}

// 個人通知：發到某使用者自綁的所有通道（Telegram + 瀏覽器推播，各自選配）。
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
  const chatId = await getUserTelegramChatId(ownerId).catch(() => null);
  const jobs: Promise<unknown>[] = [];
  if (chatId && env.telegramBotToken) jobs.push(sendTelegram(env.telegramBotToken, chatId, text));
  if (isPushConfigured()) jobs.push(sendUserPush(ownerId, text)); // 瀏覽器推播（無訂閱則內部略過）
  await Promise.all(jobs);
}
