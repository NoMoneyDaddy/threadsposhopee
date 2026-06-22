import type { Achievement } from "@/lib/streak";

// 連續發文 streak ＋ 成就徽章（純展示，達標點亮、未達標灰階）。
export default function AchievementsCard({ streak, achievements }: { streak: number; achievements: Achievement[] }) {
  const earned = achievements.filter((a) => a.earned).length;
  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="section-title text-base">🏆 成就與連續發文</h2>
        <span className="text-xs text-ink-3">{earned}/{achievements.length} 已解鎖</span>
      </div>
      <div className="mb-3 flex items-center gap-3 rounded-xl bg-surface-2 p-3">
        <span className="text-2xl" aria-hidden>🔥</span>
        <div>
          <div className="stat-num text-xl text-brand">{streak} 天</div>
          <div className="text-[11px] text-ink-2">{streak > 0 ? "連續發文中，別斷！" : "今天發一篇開始連續紀錄"}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {achievements.map((a) => (
          <div
            key={a.key}
            title={a.desc}
            className={`flex flex-col items-center gap-1 rounded-xl border p-2 text-center ${
              a.earned ? "border-brand/30 bg-brand/5" : "border-border bg-surface opacity-50 grayscale"
            }`}
          >
            <span className="text-xl" aria-hidden>{a.emoji}</span>
            <span className="text-[11px] font-medium text-ink">{a.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
