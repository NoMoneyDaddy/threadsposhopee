// 每日「贊助配額」：每個發文帳號每天有 N 篇要當贊助文（平台分潤連結 link-swap）。
// 規則：保底 floor 篇（當日篇數達 minPostsForFloor 才觸發），其後每 perPosts 篇再 +1。
//   quota = max(達門檻 ? floor : 0, floor(postCount / perPosts))
// 例（perPosts=6, floor=1, minPostsForFloor=3）：
//   0→0、2→0、3→1、6→1、12→2、13→2。
//
// 設計取捨：配額是「變現規則」，與「防封」脫鉤——發文密度的安全閥仍是每日上限／間隔／抖動，
// 不靠配額嚇阻過量。perPosts 即抽成率的槓桿：免費 6（≈1/6）、貢獻者可調大（抽更少）。
export interface SponsorQuotaOpts {
  perPosts?: number; // 每幾篇 +1 篇贊助（預設 6）
  floor?: number; // 每日保底贊助篇數（預設 1）
  minPostsForFloor?: number; // 當日篇數達此值才觸發保底（預設 1；避免極輕量用戶被重抽）
}

export function sponsorQuota(postCount: number, opts: SponsorQuotaOpts = {}): number {
  const perPosts = opts.perPosts ?? 6;
  const floor = opts.floor ?? 1;
  const minPostsForFloor = opts.minPostsForFloor ?? 1;
  if (!Number.isFinite(postCount) || postCount <= 0 || perPosts <= 0) return 0;
  // 低頻免抽硬閘門：當日自發 < minPostsForFloor 一律 0（含 by-volume 項），
  // 否則 perPosts 設得比門檻小時低頻者仍可能被 by-volume 抽到，違反「完全不抽」承諾。
  if (postCount < minPostsForFloor) return 0;
  const byVolume = Math.floor(postCount / perPosts);
  return Math.max(floor, byVolume);
}
