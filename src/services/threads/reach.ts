// 觸及驟降偵測（疑似 shadowban／被降觸及）：把已抓到 insights 的貼文依時間切成
// 「近期」與「基準」兩段，比較中位觀看數。近期明顯低於基準且樣本足夠即示警，
// 提醒操作者放慢節奏、檢查內容合規（防封核心訊號之一）。
// 用「中位數」而非平均，避免單篇爆文或冷門把結果拉偏。

export interface ReachDrop {
  hasSignal: boolean;
  recentMedian: number;
  baselineMedian: number;
  ratio: number; // recentMedian / baselineMedian（基準為 0 時視為 1，不示警）
  recentN: number;
  baselineN: number;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function detectReachDrop(
  posts: { publishedAt: string | null; views: number }[],
  opts: { minSamples?: number; dropRatio?: number; minBaselineViews?: number } = {}
): ReachDrop {
  const minSamples = opts.minSamples ?? 6;
  const dropRatio = opts.dropRatio ?? 0.5;
  // 基準中位需達此門檻才示警：低觸及/新帳號隨機波動（如 2→0）易腰斬，避免虛警。
  const minBaselineViews = opts.minBaselineViews ?? 10;
  const none: ReachDrop = { hasSignal: false, recentMedian: 0, baselineMedian: 0, ratio: 1, recentN: 0, baselineN: 0 };

  const dated = posts
    .filter((p) => p.publishedAt && Number.isFinite(p.views) && p.views >= 0)
    .map((p) => ({ t: new Date(p.publishedAt as string).getTime(), views: p.views }))
    .filter((p) => Number.isFinite(p.t))
    .sort((a, b) => b.t - a.t); // 新 → 舊
  if (dated.length < minSamples) return none;

  const half = Math.floor(dated.length / 2);
  const recent = dated.slice(0, half).map((p) => p.views);
  const baseline = dated.slice(half).map((p) => p.views);
  const recentMedian = median(recent);
  const baselineMedian = median(baseline);
  const ratio = baselineMedian > 0 ? recentMedian / baselineMedian : 1;
  return {
    hasSignal: baselineMedian >= minBaselineViews && ratio < dropRatio,
    recentMedian,
    baselineMedian,
    ratio,
    recentN: recent.length,
    baselineN: baseline.length
  };
}
