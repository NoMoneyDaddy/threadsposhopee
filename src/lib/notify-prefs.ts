// 個人通知類型與偏好（純定義；DB 讀寫在 credentials.ts）。預設全開，只有明確設 false 才關。
export const NOTIFY_TYPES = [
  { key: "draft_pending", label: "新草稿待審" },
  { key: "publish_uncertain", label: "發布待確認" },
  { key: "reply_failed", label: "留言補發失敗" },
  { key: "link_dead", label: "分潤連結失效" },
  { key: "token_expiring", label: "Token 即將到期／展期失敗" },
  { key: "account_paused", label: "帳號被暫停" },
  { key: "sponsor_violation", label: "贊助文違規" },
  { key: "sponsor_used", label: "貼文被作為贊助文" },
  { key: "daily_digest", label: "每日成效摘要" },
  { key: "weekly_digest", label: "每週績效摘要" },
  { key: "monthly_digest", label: "每月績效摘要" }
] as const;

export type NotifyType = (typeof NOTIFY_TYPES)[number]["key"];
export type NotifyPrefs = Record<string, boolean>;

export function normalizeNotifyPrefs(raw: unknown): NotifyPrefs {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: NotifyPrefs = {};
  for (const t of NOTIFY_TYPES) {
    out[t.key] = obj[t.key] === false ? false : true; // 預設開
  }
  return out;
}
