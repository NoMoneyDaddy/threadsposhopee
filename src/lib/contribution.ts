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

// 平台保底上限：即使頂級貢獻者，平台仍至少「每 SPONSOR_MAX_PER_POSTS 篇抽 1 篇」（抽成永不歸零）。
// 這保證「全站都高貢獻」時平台仍有穩定基礎收入，同時貢獻越高抽越少、越公平。
export const SPONSOR_MAX_PER_POSTS = 60;

// 依貢獻分數放寬抽成：分數越高 perPosts 越大（抽越少）。每 SPONSOR_EXEMPT_CONTRIBUTION 分約 +1 倍基礎，
// 線性成長並封頂於 SPONSOR_MAX_PER_POSTS（永不歸零＝平台保底）。純函式可測。
export function contributionAdjustedPerPosts(perPosts: number, contributionScore: number): number {
  if (!Number.isFinite(perPosts) || perPosts <= 0) return perPosts;
  const s = Math.max(0, contributionScore);
  const grown = perPosts * (1 + s / SPONSOR_EXEMPT_CONTRIBUTION);
  return Math.max(1, Math.min(SPONSOR_MAX_PER_POSTS, Math.round(grown)));
}

// 貢獻分數 = 被匯入次數 + 分享素材篇數 + 資料貢獻紅利（皆權重 1）。
// 計算統一在 DB（migration 0042 的 get_contribution_score／top_contributors），不在 TS 重算，避免雙算。
// 等級顯示沿用 roles.ts 的勳章階梯（contributionBadge），不另立一套。
