// 連續發文 streak 與成就徽章（純函式，可測）。
// streak＝「最近連續有發布的天數」（以 Asia/Taipei 日界；今天或昨天有發＝streak 仍續，避免當天尚未發就歸零）。

// 某 epoch ms 在台北時區的日期字串 YYYY-MM-DD。
export function taipeiDateStr(ms: number): string {
  // en-CA 產出 YYYY-MM-DD
  return new Date(ms).toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
}

function addDays(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + delta * 86400_000;
  return new Date(t).toISOString().slice(0, 10);
}

// 計算連續發文天數。dates：發布日（YYYY-MM-DD，可重複/亂序）；today：台北今天。
export function computeStreak(dates: string[], today: string): number {
  const set = new Set(dates);
  if (set.size === 0) return 0;
  // 起點：今天有發從今天起算；否則若昨天有發，從昨天起算（今天還沒過完，不算斷）。
  let cursor: string;
  if (set.has(today)) cursor = today;
  else if (set.has(addDays(today, -1))) cursor = addDays(today, -1);
  else return 0;
  let streak = 0;
  while (set.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export type Achievement = { key: string; label: string; emoji: string; desc: string; earned: boolean };

export type AchievementStats = { published: number; contribution: number; streak: number };

// 由現有統計推導成就（不另存 DB；達標即點亮）。
export function achievementsFor(s: AchievementStats): Achievement[] {
  return [
    { key: "first_post", label: "初次發布", emoji: "🎬", desc: "發布第 1 篇貼文", earned: s.published >= 1 },
    { key: "ten_posts", label: "穩定產出", emoji: "📦", desc: "累計發布 10 篇", earned: s.published >= 10 },
    { key: "fifty_posts", label: "量產達人", emoji: "🏭", desc: "累計發布 50 篇", earned: s.published >= 50 },
    { key: "streak3", label: "三日連發", emoji: "🔥", desc: "連續 3 天發布", earned: s.streak >= 3 },
    { key: "streak7", label: "七日連發", emoji: "🌟", desc: "連續 7 天發布", earned: s.streak >= 7 },
    { key: "contributor", label: "分享者", emoji: "✨", desc: "分享的素材被匯入 1 次", earned: s.contribution >= 1 },
    { key: "high_contrib", label: "高貢獻者", emoji: "🏅", desc: "被匯入 5 次", earned: s.contribution >= 5 },
    { key: "elite_contrib", label: "頂級貢獻者", emoji: "👑", desc: "被匯入 20 次", earned: s.contribution >= 20 }
  ];
}
