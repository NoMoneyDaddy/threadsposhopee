// 共享素材貢獻分數與獎勵門檻：貢獻分數＝自己分享的素材被別人匯入的總次數。
// 兩級獎勵（皆刻意調高，避免太易取得）：
//   免贊助（exempt，較易）< 自賺 own_link（較難，連結換成自己的、自己賺分潤）。
// 純常數／函式，可測。
export const SPONSOR_EXEMPT_CONTRIBUTION = 20; // 免每日贊助文門檻（原 5 調高）
export const OWN_LINK_CONTRIBUTION = 60; // 自賺（換自己連結）門檻：比免贊助更難

export function isSponsorExempt(contributionScore: number): boolean {
  return contributionScore >= SPONSOR_EXEMPT_CONTRIBUTION;
}

// 自賺（own_link）資格：門檻更高，刻意讓「換成自己連結賺分潤」較難取得。
export function canOwnLink(contributionScore: number): boolean {
  return contributionScore >= OWN_LINK_CONTRIBUTION;
}

// 貢獻分數 = 被匯入次數 × W_IMPORT + 分享素材篇數 × W_SHARED。
// 兩者並計：被匯入＝下游實際採用（價值高）；分享篇數＝鼓勵持續貢獻（權重較低，避免灌量刷分）。
export const CONTRIB_W_IMPORT = 1; // 每次被別人匯入
export const CONTRIB_W_SHARED = 1; // 每篇分享進公共池的素材

export function combinedContributionScore(importTotal: number, sharedCount: number): number {
  const imp = Number.isFinite(importTotal) && importTotal > 0 ? importTotal : 0;
  const shared = Number.isFinite(sharedCount) && sharedCount > 0 ? sharedCount : 0;
  return Math.floor(imp * CONTRIB_W_IMPORT + shared * CONTRIB_W_SHARED);
}

// 貢獻等級（公開排行／個人頁顯示）沿用 roles.ts 的勳章階梯（contributionBadge），不另立一套。
