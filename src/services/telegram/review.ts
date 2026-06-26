// Telegram 遠端審核：把待審草稿推到使用者綁定的 Telegram chat，附「核准／駁回」inline 按鈕。
// 平台共用機器人（env.TELEGRAM_BOT_TOKEN）；使用者於設定頁綁自己的 chat id。
import { env } from "@/lib/env";
import { sendTelegramButtons } from "@/lib/notify";
import { getUserTelegramChatId, getNotifyPrefs } from "@/lib/store";
import { log } from "@/lib/logger";
import type { Draft } from "@/lib/types";

// callback_data 格式：apv:<draftId> / rej:<draftId>（draftId 為 uuid，總長 < 64 bytes）。
export const TG_APPROVE_PREFIX = "apv:";
export const TG_REJECT_PREFIX = "rej:";

function preview(draft: Draft): string {
  const title = draft.product_name?.trim();
  const body = (draft.main_text ?? "").replace(/\s+/g, " ").trim().slice(0, 180);
  const head = title ? `🛒 ${title}\n` : "";
  return `📝 新草稿待審核\n${head}${body}${body.length >= 180 ? "…" : ""}`;
}

// 發送單篇待審草稿的審核通知。無 bot token／未綁 chat／關閉 draft_pending 通知時靜默略過。絕不丟錯。
export async function notifyDraftPendingForReview(ownerId: string, draft: Draft): Promise<void> {
  try {
    if (!env.telegramBotToken) return;
    const [chatId, prefs] = await Promise.all([
      getUserTelegramChatId(ownerId).catch(() => null),
      getNotifyPrefs(ownerId).catch(() => null)
    ]);
    if (!chatId) return;
    if (prefs && prefs.draft_pending === false) return;
    await sendTelegramButtons(env.telegramBotToken, chatId, preview(draft), [
      { text: "✅ 核准", data: `${TG_APPROVE_PREFIX}${draft.id}` },
      { text: "🗑 駁回", data: `${TG_REJECT_PREFIX}${draft.id}` }
    ]);
  } catch (e) {
    log.warn("Telegram 審核通知失敗", { ownerId, draftId: draft.id, err: e instanceof Error ? e.message : e });
  }
}
