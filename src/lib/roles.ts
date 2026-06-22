// 身份組與榮譽勳章（純函式，可測）：
// - 自動身份組依「貢獻分數」（分享素材被匯入總次數）分階，各階一枚勳章。
// - 手動身份組（reviewer 審查員）由管理員賦予，存 profiles.roles；管理員（owner）以 email 判定。
// - 頂級素材＝匯入數＋收藏數的加權分達門檻，用於推薦排序與標記。

export type ManualRole = "reviewer";
export const MANUAL_ROLES: ManualRole[] = ["reviewer"];

export type Badge = {
  key: string;
  label: string;
  emoji: string;
  // tailwind 用的語意色票（對應 globals.css 既有 token）
  tone: "neutral" | "brand" | "success" | "warn";
};

// 貢獻分數階梯（由低到高；取「達到的最高階」當主勳章）。
const TIERS: { min: number; badge: Badge }[] = [
  { min: 0, badge: { key: "rookie", label: "新手", emoji: "🌱", tone: "neutral" } },
  { min: 1, badge: { key: "contributor", label: "貢獻者", emoji: "✨", tone: "brand" } },
  // 勳章階梯為「榮譽顯示」，與獎勵門檻（contribution.ts）脫鉤、各自獨立。
  { min: 5, badge: { key: "high", label: "高貢獻者", emoji: "🏅", tone: "success" } },
  { min: 20, badge: { key: "elite", label: "頂級貢獻者", emoji: "👑", tone: "warn" } }
];

// 取貢獻分數對應的主勳章（達到的最高階）。
export function contributionBadge(score: number): Badge {
  let cur = TIERS[0].badge;
  for (const t of TIERS) if (score >= t.min) cur = t.badge;
  return cur;
}

const REVIEWER_BADGE: Badge = { key: "reviewer", label: "審查員", emoji: "🛡️", tone: "brand" };
const ADMIN_BADGE: Badge = { key: "admin", label: "管理員", emoji: "⚙️", tone: "warn" };

// 某使用者目前擁有的所有勳章（主貢獻勳章 ＋ 手動身份組 ＋ 管理員）。
export function badgesFor(input: { score: number; roles?: string[] | null; isOwner?: boolean }): Badge[] {
  const out: Badge[] = [contributionBadge(input.score)];
  if ((input.roles ?? []).includes("reviewer")) out.push(REVIEWER_BADGE);
  if (input.isOwner) out.push(ADMIN_BADGE);
  return out;
}

// 是否具審核權限：管理員（owner）或被賦予 reviewer 身份組。
export function isReviewer(roles: string[] | null | undefined, isOwner: boolean): boolean {
  return Boolean(isOwner || (roles ?? []).includes("reviewer"));
}

// 過濾出合法的手動身份組（防止任意字串寫入 DB）。
export function sanitizeRoles(input: unknown): ManualRole[] {
  if (!Array.isArray(input)) return [];
  return MANUAL_ROLES.filter((r) => input.includes(r));
}

// ── 頂級素材（推薦排序）──────────────────────────────────────
// 收藏較「主動表態」，權重高於匯入。分數達門檻即標記為頂級。
export const TOP_MATERIAL_THRESHOLD = 6;
export function materialScore(importCount: number, favoriteCount: number): number {
  return Math.max(0, importCount) + Math.max(0, favoriteCount) * 2;
}
export function isTopMaterial(importCount: number, favoriteCount: number): boolean {
  return materialScore(importCount, favoriteCount) >= TOP_MATERIAL_THRESHOLD;
}
