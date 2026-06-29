// 月份日期工具（純函式、可測）：快選月份填 after/before、批次逐月展開月份清單。
// YYYY-MM 字串字典序即時間序，可直接比較。

const YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// 批次逐月一次最多月數（防調頻率與 Apify 費用；每月一個 run）。
export const MAX_BATCH_MONTHS = 12;

export function isValidMonth(ym: string): boolean {
  return YM_RE.test(ym);
}

// "YYYY-MM" → 該月起訖日（含），YYYY-MM-DD。非法格式回 null。
export function monthBounds(ym: string): { after: string; before: string } | null {
  if (!YM_RE.test(ym)) return null;
  const [y, m] = ym.split("-").map(Number);
  // Date.UTC(y, m, 0)＝該月最後一天（m 為 1-based，第 0 天回推到上個月最後一天）。
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { after: `${ym}-01`, before: `${ym}-${String(last).padStart(2, "0")}` };
}

// 起訖月份（含）展開成 "YYYY-MM" 清單；最多 cap 個（超過則截斷，由呼叫端提示）。
// 格式不符或 start 晚於 end → 回空陣列。
export function monthsBetween(startYm: string, endYm: string, cap = MAX_BATCH_MONTHS): string[] {
  if (!YM_RE.test(startYm) || !YM_RE.test(endYm) || startYm > endYm) return [];
  const out: string[] = [];
  let [y, m] = startYm.split("-").map(Number);
  while (out.length < cap) {
    const ym = `${y}-${String(m).padStart(2, "0")}`;
    out.push(ym);
    if (ym === endYm) break;
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}
