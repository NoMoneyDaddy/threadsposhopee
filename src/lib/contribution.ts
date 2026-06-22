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

// 貢獻等級（公開排行／個人頁顯示）沿用 roles.ts 的勳章階梯（contributionBadge），不另立一套。
