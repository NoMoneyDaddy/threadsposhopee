// 成效區間解析（成效頁與 CSV 匯出共用）：支援預設 days 或自訂 from/to（台北日期）。
export const INSIGHTS_PERIODS: { days: number; label: string }[] = [
  { days: 1, label: "今日" },
  { days: 7, label: "近 7 天" },
  { days: 30, label: "近 30 天" },
  { days: 90, label: "近 90 天" },
  { days: 365, label: "近一年" }
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// 台北日期（YYYY-MM-DD）轉 epoch ms。台北固定 UTC+8、無日光節約。
export function taipeiMs(date: string, end: boolean): number | null {
  if (!DATE_RE.test(date)) return null;
  const t = Date.parse(`${date}T${end ? "23:59:59" : "00:00:00"}+08:00`);
  return Number.isNaN(t) ? null : t;
}

export interface ResolvedRange {
  startMs: number;
  endMs: number;
  days: number;
  label: string;
  custom: boolean;
}

export function resolveInsightsRange(sp: { days?: string; from?: string; to?: string }): ResolvedRange {
  const fromMs = sp.from ? taipeiMs(sp.from, false) : null;
  const toMs = sp.to ? taipeiMs(sp.to, true) : null;
  const custom = fromMs !== null && toMs !== null && fromMs <= toMs;
  const days = INSIGHTS_PERIODS.some((p) => p.days === Number(sp.days)) ? Number(sp.days) : 30;
  const endMs = custom ? (toMs as number) : Date.now();
  const startMs = custom ? (fromMs as number) : endMs - days * 86400_000;
  const label = custom
    ? `${sp.from} ~ ${sp.to}`
    : INSIGHTS_PERIODS.find((p) => p.days === days)?.label ?? `近 ${days} 天`;
  return { startMs, endMs, days, label, custom };
}
