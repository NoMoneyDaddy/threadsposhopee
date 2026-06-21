// 贊助文章設定（功能 B）：owner 設定要替換進贊助文的平台分潤連結、冷門時段與開關。
// 存 app_state 單列（key=sponsor_config），demo 走預設值。
import { getServiceClient } from "./supabase/server";
import { isDemoMode } from "./env";

export interface SponsorConfig {
  enabled: boolean;
  affiliateLink: string; // 要暫時替換進待發草稿的「平台」蝦皮分潤連結
  offPeakStart: number; // 冷門時段起（小時 0–23，Asia/Taipei）
  offPeakEnd: number; // 冷門時段迄（小時 0–24）
}

const KEY = "sponsor_config";
export const DEFAULT_SPONSOR_CONFIG: SponsorConfig = {
  enabled: false,
  affiliateLink: "",
  offPeakStart: 2,
  offPeakEnd: 5
};

export async function getSponsorConfig(): Promise<SponsorConfig> {
  if (isDemoMode) return DEFAULT_SPONSOR_CONFIG;
  const sb = getServiceClient()!;
  const { data } = await sb.from("app_state").select("value").eq("key", KEY).maybeSingle();
  if (!data?.value) return DEFAULT_SPONSOR_CONFIG;
  try {
    return { ...DEFAULT_SPONSOR_CONFIG, ...(JSON.parse(data.value) as Partial<SponsorConfig>) };
  } catch {
    return DEFAULT_SPONSOR_CONFIG;
  }
}

export async function setSponsorConfig(cfg: SponsorConfig): Promise<void> {
  if (isDemoMode) return;
  const sb = getServiceClient()!;
  await sb
    .from("app_state")
    .upsert({ key: KEY, value: JSON.stringify(cfg), updated_at: new Date().toISOString() }, { onConflict: "key" });
}

// 正規化＋驗證輸入（小時界線、連結需為 http(s)）。回傳清理後設定或錯誤訊息。
export function normalizeSponsorConfig(input: Partial<SponsorConfig>): { ok: true; cfg: SponsorConfig } | { ok: false; error: string } {
  const enabled = Boolean(input.enabled);
  const affiliateLink = String(input.affiliateLink ?? "").trim();
  const offPeakStart = Number(input.offPeakStart);
  const offPeakEnd = Number(input.offPeakEnd);
  if (enabled && !/^https?:\/\//i.test(affiliateLink)) {
    return { ok: false, error: "啟用時必須填入有效的平台分潤連結（http/https）" };
  }
  if (!Number.isInteger(offPeakStart) || !Number.isInteger(offPeakEnd) || offPeakStart < 0 || offPeakStart > 23 || offPeakEnd < 1 || offPeakEnd > 24 || offPeakStart >= offPeakEnd) {
    return { ok: false, error: "冷門時段需為 0–24 的整數且起 < 迄" };
  }
  return { ok: true, cfg: { enabled, affiliateLink, offPeakStart, offPeakEnd } };
}
