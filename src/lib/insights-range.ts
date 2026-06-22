// 成效區間解析（成效頁與 CSV 匯出共用）：固定幾個預設區間（days），不支援自訂日期或一年。
export const INSIGHTS_PERIODS: { days: number; label: string }[] = [
  { days: 1, label: "今日" },
  { days: 7, label: "近 7 天" },
  { days: 30, label: "近 30 天" },
  { days: 90, label: "近 90 天" }
];

export interface ResolvedRange {
  startMs: number;
  endMs: number;
  days: number;
  label: string;
}

export function resolveInsightsRange(sp: { days?: string }): ResolvedRange {
  const days = INSIGHTS_PERIODS.some((p) => p.days === Number(sp.days)) ? Number(sp.days) : 30;
  const endMs = Date.now();
  const startMs = endMs - days * 86400_000;
  const label = INSIGHTS_PERIODS.find((p) => p.days === days)?.label ?? `近 ${days} 天`;
  return { startMs, endMs, days, label };
}
