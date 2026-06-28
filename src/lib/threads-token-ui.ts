import { tokenExpiryState } from "./token-expiry";

// Threads 權杖徽章（純函式，可測）：依到期日把帳號分成四態，給帳號頁顯示。
// - short：無到期日＝尚未換成長期權杖（短效 token）。
// - invalid：有到期日但格式異常。
// - long：長期權杖有效（含即將到期）。
// - long-expired：長期權杖已過期，無法自動展期。
export type ThreadsTokenKind = "short" | "invalid" | "long" | "long-expired";

export interface ThreadsTokenBadge {
  kind: ThreadsTokenKind;
  label: string;
  title: string;
}

export function threadsTokenBadge(expiresAt: string | null | undefined, now = Date.now()): ThreadsTokenBadge {
  if (!expiresAt) {
    return { kind: "short", label: "短期權杖", title: "尚未換成長期權杖；新增時附上 App 密鑰即可自動換 60 天長期" };
  }
  const exp = tokenExpiryState(expiresAt, 7, now);
  if (exp.level === "unknown") {
    return { kind: "invalid", label: "權杖資訊異常", title: "權杖到期資訊格式異常，請重新貼上 token" };
  }
  if (exp.level === "expired") {
    return { kind: "long-expired", label: "長期權杖（已過期）", title: "長期權杖已過期，無法自動展期，請重新綁定" };
  }
  // 註：展期是「到期前 7 天視窗內」才嘗試 refresh，非每日真的換 token，故文案用「到期前自動嘗試展期」。
  return { kind: "long", label: "長期權杖", title: "已換成 60 天長期權杖，系統會在到期前自動嘗試展期" };
}
