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

// ── 累積比例（取代每日門檻，補掉「每天壓在門檻下就永遠免抽」的漏洞）──────
// 依帳號「累積發文數」自我校正：這篇是否該當贊助文＝目前累積贊助數 < 依累積發文數應有的目標數。
// 例（perPosts=6）：累積發到第 6 篇才抽第 1 篇；第 12 篇抽第 2 篇…長期維持約 1/perPosts。
// 每天只發 2 篇的人，累積幾天到 6 篇一樣會被抽 → 不再有每日門檻漏洞。純函式可測。
export function shouldSponsorCumulative(publishedBefore: number, sponsoredTotal: number, perPosts: number): boolean {
  if (!Number.isFinite(perPosts) || perPosts <= 0) return false;
  const target = Math.floor((Math.max(0, publishedBefore) + 1) / perPosts); // +1＝含這篇
  return Math.max(0, sponsoredTotal) < target;
}

// own-link 使用者的贊助 slot 是否走「自己連結」自賺：以累積贊助序號交錯，偶數序號留給平台
// （保障平台永遠拿到約一半、不歸零），奇數序號給貢獻者自賺。純函式可測。
export function ownLinkThisSlot(sponsoredTotalBefore: number): boolean {
  return Math.max(0, sponsoredTotalBefore) % 2 === 1;
}

