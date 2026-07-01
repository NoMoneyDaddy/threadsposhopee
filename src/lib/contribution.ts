// 共享素材貢獻分數與獎勵：一套「四級階梯」同時當榮譽徽章與贊助回饋（避免兩套門檻造成混淆）。
// 分數（DB get_contribution_score，重質）＝被匯入次數×3 ＋ 優質素材（被匯入≥3 的分享素材）×5 ＋ 資料紅利。
// 純常數／函式，可測。

// 平台保底上限：即使頂級貢獻者，平台仍至少「每 SPONSOR_MAX_PER_POSTS 篇抽 1 篇」（抽成永不歸零）。
export const SPONSOR_MAX_PER_POSTS = 60;

export interface ContribTier {
  min: number; // 達此分數即進此級
  key: string;
  label: string;
  emoji: string;
  perPostsMultiplier: number; // 贊助抽成：基礎 perPosts × 此倍數（越大＝抽越少）
  ownLink: boolean; // 是否解鎖「換自己連結自賺」
}

// 四級階梯（由低到高）。倍數以基礎 6 為例＝ 6／12／30／60 篇抽 1（頂級即平台保底）。
export const CONTRIB_TIERS: ContribTier[] = [
  { min: 0, key: "rookie", label: "新手", emoji: "🌱", perPostsMultiplier: 1, ownLink: false },
  { min: 15, key: "contributor", label: "貢獻者", emoji: "✨", perPostsMultiplier: 2, ownLink: false },
  { min: 40, key: "high", label: "高貢獻", emoji: "🏅", perPostsMultiplier: 5, ownLink: false },
  { min: 100, key: "elite", label: "頂級", emoji: "👑", perPostsMultiplier: 10, ownLink: true }
];

// 相容常數：貢獻者起步門檻（回饋開始有感）、自賺（頂級）門檻。
export const SPONSOR_EXEMPT_CONTRIBUTION = 15;
export const OWN_LINK_CONTRIBUTION = 100;

// 目前所在級（達到的最高階）。
export function contribTier(score: number): ContribTier {
  let cur = CONTRIB_TIERS[0];
  for (const t of CONTRIB_TIERS) if (score >= t.min) cur = t;
  return cur;
}

// 下一級（尚未達最高級時），供進度卡顯示「還差幾分」。
export function nextContribTier(score: number): ContribTier | null {
  return CONTRIB_TIERS.find((t) => t.min > score) ?? null;
}

export function isSponsorExempt(contributionScore: number): boolean {
  return contributionScore >= SPONSOR_EXEMPT_CONTRIBUTION;
}

// 自賺（own_link）資格＝已達頂級。
export function canOwnLink(contributionScore: number): boolean {
  return contribTier(contributionScore).ownLink;
}

// 依貢獻階梯放寬抽成：perPosts × 該級倍數（分段、好懂），封頂 SPONSOR_MAX_PER_POSTS（平台保底、永不歸零）。純函式可測。
export function contributionAdjustedPerPosts(perPosts: number, contributionScore: number): number {
  if (!Number.isFinite(perPosts) || perPosts <= 0) return perPosts;
  const mult = contribTier(contributionScore).perPostsMultiplier;
  return Math.max(1, Math.min(SPONSOR_MAX_PER_POSTS, Math.round(perPosts * mult)));
}
