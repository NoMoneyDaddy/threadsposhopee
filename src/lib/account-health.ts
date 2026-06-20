// 帳號健康分：把帳號狀態（active/paused/error）＋ token 到期狀態彙整成單一健康等級，
// 讓多帳號操作者一眼看出「哪個帳號需要處理」。純函式，給儀表板用。
import { tokenExpiryState } from "./token-expiry";

export type HealthLevel = "ok" | "warn" | "error";

export interface AccountHealth {
  label: string;
  level: HealthLevel;
  summary: string;
}

export function accountHealth(
  acc: { label: string; status: "active" | "paused" | "error"; token_expires_at?: string | null },
  now = Date.now()
): AccountHealth {
  const tok = tokenExpiryState(acc.token_expires_at, 7, now);
  if (acc.status === "error" || tok.level === "expired") {
    return {
      label: acc.label,
      level: "error",
      summary: acc.status === "error" ? "token 異常（展期失敗），已停止發文" : "token 已過期，需重新授權"
    };
  }
  if (acc.status === "paused") return { label: acc.label, level: "warn", summary: "已暫停" };
  if (tok.level === "soon") return { label: acc.label, level: "warn", summary: `token ${tok.daysLeft} 天後到期` };
  if (tok.level === "unknown") return { label: acc.label, level: "warn", summary: "無 token 到期資訊" };
  return { label: acc.label, level: "ok", summary: `正常（token 約 ${tok.daysLeft} 天）` };
}

// 排序：問題優先（error → warn → ok），同級維持原序，方便操作者先看要處理的。
export function sortByHealth(list: AccountHealth[]): AccountHealth[] {
  const rank: Record<HealthLevel, number> = { error: 0, warn: 1, ok: 2 };
  return [...list].sort((a, b) => rank[a.level] - rank[b.level]);
}
