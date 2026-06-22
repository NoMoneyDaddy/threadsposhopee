// 共享素材貢獻分數與獎勵門檻：貢獻分數＝自己分享的素材被別人匯入的總次數。
// 達門檻者免除「每日 1 篇贊助文章」（高貢獻者回饋）。純常數/函式，可測。
export const SPONSOR_EXEMPT_CONTRIBUTION = 5;

export function isSponsorExempt(contributionScore: number): boolean {
  return contributionScore >= SPONSOR_EXEMPT_CONTRIBUTION;
}
