import Link from "next/link";
import { contributionAdjustedPerPosts, canOwnLink, OWN_LINK_CONTRIBUTION, SPONSOR_MAX_PER_POSTS } from "@/lib/contribution";

// 貢獻進度卡：一目了然「你的貢獻分數→贊助抽成越少→可換自己連結賺分潤」，並鼓勵持續上傳分享。
// 前端只講結果（每 N 篇 1 篇、還差幾分解鎖自賺），機制細節見《贊助文規則》。
export default function ContributionRewardCard({ score, basePerPosts = 6 }: { score: number; basePerPosts?: number }) {
  const effN = contributionAdjustedPerPosts(basePerPosts, score);
  const unlocked = canOwnLink(score);
  const toOwn = Math.max(0, OWN_LINK_CONTRIBUTION - score);
  // 進度以「自賺門檻」為終點，讓進度條有明確目標。
  const pct = Math.min(100, Math.round((score / OWN_LINK_CONTRIBUTION) * 100));

  return (
    <div className="card p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-ink">🎯 你的貢獻與贊助回饋</span>
        <span className="text-xs text-ink-3">貢獻分數 {score}</span>
      </div>
      <p className="mb-2 text-xs text-ink-2">
        分享商品被越多人匯入，貢獻越高、贊助文抽成越少（平台保底最多每 {SPONSOR_MAX_PER_POSTS} 篇 1 篇，永不歸零）。
        目前你的帳號約<b className="text-ink"> 每 {effN} 篇 1 篇</b>為贊助文。
      </p>
      <div className="mb-1 h-2 w-full overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-brand/70" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-ink-3">
        {unlocked ? (
          <>已解鎖「換自己連結賺分潤」🎉 可在下方選擇回饋方式。</>
        ) : (
          <>再 <b className="text-ink">{toOwn}</b> 分可解鎖「換自己連結賺分潤」（把超過保底的贊助篇換成你的分潤連結、分潤算你）。</>
        )}
        {" "}
        <Link href="/sponsored" className="text-brand hover:underline">規則</Link>
      </p>
    </div>
  );
}
