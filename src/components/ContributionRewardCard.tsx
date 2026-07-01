import Link from "next/link";
import { contribTier, nextContribTier, contributionAdjustedPerPosts, SPONSOR_MAX_PER_POSTS } from "@/lib/contribution";

// 貢獻進度卡：一目了然「你在哪級、目前抽成、下一級要幾分＋有什麼好處」，鼓勵持續上傳分享。
// 前端只講結果（每 N 篇 1 篇、升級好處），機制細節見《贊助文規則》。
export default function ContributionRewardCard({ score, basePerPosts = 6 }: { score: number; basePerPosts?: number }) {
  const tier = contribTier(score);
  const next = nextContribTier(score);
  const effN = contributionAdjustedPerPosts(basePerPosts, score);
  const nextN = next ? contributionAdjustedPerPosts(basePerPosts, next.min) : effN;
  // 進度條：目前級 → 下一級的區間百分比（頂級則滿格）。
  const pct = next ? Math.min(100, Math.round(((score - tier.min) / (next.min - tier.min)) * 100)) : 100;

  return (
    <div className="card p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-ink">
          {tier.emoji} {tier.label}
        </span>
        <span className="text-xs text-ink-3">貢獻分數 {score}</span>
      </div>
      <p className="mb-2 text-xs text-ink-2">
        分享商品被越多人匯入，貢獻越高、贊助文抽成越少（平台保底最多每 {SPONSOR_MAX_PER_POSTS} 篇 1 篇，永不歸零）。
        目前你的帳號約<b className="text-ink"> 每 {effN} 篇 1 篇</b>為贊助文{tier.ownLink ? "，且已可換自己連結自賺 🎉" : ""}。
      </p>
      <div className="mb-1 h-2 w-full overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-brand/70" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-ink-3">
        {next ? (
          <>
            再 <b className="text-ink">{next.min - score}</b> 分升上 <b className="text-ink">{next.emoji} {next.label}</b>
            （{next.ownLink ? "可換自己連結自賺" : `抽成降到約每 ${nextN} 篇 1 篇`}）。
          </>
        ) : (
          <>已達最高級 👑，享最低抽成＋換自己連結自賺。</>
        )}{" "}
        <Link href="/sponsored" className="text-brand hover:underline">規則</Link>
      </p>
    </div>
  );
}
