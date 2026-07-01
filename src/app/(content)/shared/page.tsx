import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import ImportSharedButton from "@/components/ImportSharedButton";
import ShareToggle from "@/components/ShareToggle";
import RewardModeForm from "@/components/RewardModeForm";
import ContributionRewardCard from "@/components/ContributionRewardCard";
import { getSponsorConfig } from "@/lib/sponsor";
import BadgeRow from "@/components/BadgeRow";
import ReviewButton from "@/components/ReviewButton";
import {
  listSharedMaterials,
  listMySharedMaterials,
  getContributionScore,
  getSponsorRewardMode,
  getFeatureFlags,
  getRoles,
  listTopContributors,
  type SharedMaterial
} from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";
import { cloudinaryThumb } from "@/lib/img";
import { canOwnLink, contribTier } from "@/lib/contribution";
import { badgesFor, isReviewer, contributionBadge, isTopMaterial } from "@/lib/roles";

export const dynamic = "force-dynamic";

// 商品媒體預覽（圖／影片首幀）：共享庫兩個分頁共用。
function MediaPreview({ m }: { m: SharedMaterial }) {
  if (m.cloudinary_media_url && m.media_type === "video") {
    return <video src={`${m.cloudinary_media_url}#t=0.001`} muted playsInline preload="metadata" aria-hidden="true" tabIndex={-1} className="mb-2 h-32 w-full rounded object-cover" />;
  }
  if (m.cloudinary_media_url && m.media_type === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={cloudinaryThumb(m.cloudinary_media_url, 600)} alt="" role="presentation" loading="lazy" referrerPolicy="no-referrer" className="mb-2 h-32 w-full rounded object-cover" />;
  }
  return null;
}

// 共享庫：分兩個分頁——「探索（別人分享）」用自己金鑰匯入；「我分享的」管理自己貢獻的商品。
// 含身份組勳章、貢獻排行榜、收藏、頂級素材標記與審查員審核。
export default async function SharedPage({ searchParams }: { searchParams: { tab?: string } }) {
  const user = await getCurrentUser();
  if (!user) return <div className="text-center text-sm text-red-500">請先登入。</div>;

  const flags = await getFeatureFlags();
  if (!flags.shared) {
    return <EmptyState icon="🚧" title="共享庫目前未開放" hint="管理員已暫時關閉此功能，請稍後再來。" />;
  }

  const tab = searchParams.tab === "mine" ? "mine" : "explore";

  const [items, mine, contribution, rewardMode, roles, leaders] = await Promise.all([
    listSharedMaterials(user.id).catch(() => []),
    listMySharedMaterials(user.id).catch(() => [] as SharedMaterial[]),
    getContributionScore(user.id).catch(() => 0),
    getSponsorRewardMode(user.id).catch(() => "exempt" as const),
    getRoles(user.id).catch(() => []),
    flags.leaderboard ? listTopContributors(5).catch(() => []) : Promise.resolve([])
  ]);

  // 贊助文啟用且非 owner 才顯示貢獻回饋進度卡（owner 帳號不適用贊助文）。
  const sponsorCfg = !user.isOwner ? await getSponsorConfig().catch(() => null) : null;
  const showRewardCard = Boolean(sponsorCfg?.enabled);

  const tier = contribTier(contribution);
  const reviewer = isReviewer(roles, user.isOwner);
  const myBadges = badgesFor({ score: contribution, roles, isOwner: user.isOwner });

  const tabCls = (active: boolean) =>
    "shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors " +
    (active ? "bg-brand text-white" : "bg-surface-2 text-ink-2 hover:bg-neutral-200 hover:text-ink");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">共享庫</h1>
          <p className="text-sm text-ink-2">
            {tab === "mine"
              ? "你分享出去的商品；被越多人用自己的金鑰匯入，你的貢獻越高（分享不含你的分潤連結）。"
              : "別人分享的商品，按「匯入」會用你自己的蝦皮金鑰重產分潤連結（分潤算你的）。"}
          </p>
        </div>
        <span className="badge badge-neutral" title="貢獻分數＝被匯入次數×3＋優質素材×5＋資料紅利；越高贊助抽成越少">
          {tier.emoji} {tier.label}・貢獻 {contribution}
        </span>
      </div>

      {/* 分頁：探索別人分享的 vs 管理我分享的 */}
      <nav className="flex items-center gap-2 overflow-x-auto" aria-label="共享庫分頁">
        <Link href="/shared?tab=explore" aria-current={tab === "explore" ? "page" : undefined} className={tabCls(tab === "explore")}>
          🔍 探索（別人分享）
        </Link>
        <Link href="/shared?tab=mine" aria-current={tab === "mine" ? "page" : undefined} className={tabCls(tab === "mine")}>
          📤 我分享的{mine.length > 0 ? `（${mine.length}）` : ""}
        </Link>
      </nav>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-ink-3">我的身份組：</span>
        <BadgeRow badges={myBadges} />
      </div>

      {flags.leaderboard && leaders.length > 0 && (
        <div className="card p-4">
          <h2 className="mb-2 text-sm font-semibold text-ink">🏆 貢獻排行榜</h2>
          <ol className="space-y-1">
            {leaders.map((c, i) => (
              <li key={c.owner_id} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2">
                  <span className="w-5 tabular-nums text-ink-3">#{i + 1}</span>
                  <span aria-hidden>{contributionBadge(c.score).emoji}</span>
                  <span className="text-ink" translate="no">{c.display_name || (c.bio_handle ? `@${c.bio_handle}` : `會員#${c.owner_id.slice(0, 4)}`)}</span>
                </span>
                <span className="tabular-nums text-ink-2">{c.score}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {showRewardCard && <ContributionRewardCard score={contribution} basePerPosts={sponsorCfg?.perPosts ?? 6} />}
      {showRewardCard && canOwnLink(contribution) && <RewardModeForm initial={rewardMode} />}

      {tab === "mine" ? (
        mine.length === 0 ? (
          <EmptyState
            icon="📤"
            title="你還沒有分享任何商品"
            hint="到「工作台 → 素材庫」某張卡按「分享到共享庫」，或在「設定」開啟『新素材預設分享』，新素材就會自動分享。"
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {mine.map((m) => {
              const top = isTopMaterial(m.import_count, m.favorite_count);
              return (
                <div key={m.id} className="flex min-w-0 flex-col rounded-2xl border bg-surface p-4">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-medium text-ink">
                      {top && <span className="mr-1" title="頂級素材（高匯入＋高收藏）">🔥</span>}
                      {m.product_name ?? "（商品）"}
                    </span>
                    <span className="shrink-0 rounded bg-surface-2 px-2 py-0.5 text-xs text-ink-2">被匯入 {m.import_count}</span>
                  </div>
                  <MediaPreview m={m} />
                  {m.main_text ? (
                    <div className="line-clamp-3 whitespace-pre-wrap text-sm text-ink">{m.main_text}</div>
                  ) : (
                    <div className="text-sm text-ink-3">（無文案）</div>
                  )}
                  <div className="mt-2 text-xs text-ink-3">
                    {m.affiliate_valid === false && <span className="text-warn">🔗 連結失效（暫時下架，連結復活自動恢復）</span>}
                    {m.review_status === "removed" && <span className="text-warn">・已被下架</span>}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <ShareToggle materialId={m.id} initial={true} />
                    <span className="text-xs text-ink-3">分享中（不含你的分潤連結）</span>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : items.length === 0 ? (
        <EmptyState
          icon="🤝"
          title="共享庫目前沒有別人分享的商品"
          hint="到「素材」把賺錢的商品按「分享到共享庫」，大家都能用自己的蝦皮金鑰匯入（分潤算各自的）；你被匯入越多、貢獻越高。"
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((m) => {
            const top = isTopMaterial(m.import_count, m.favorite_count);
            return (
              <div key={m.id} className="flex min-w-0 flex-col rounded-2xl border bg-surface p-4">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-medium text-ink">
                    {top && <span className="mr-1" title="頂級素材（高匯入＋高收藏）">🔥</span>}
                    {m.product_name ?? "（商品）"}
                  </span>
                  {m.import_count > 0 && (
                    <span className="shrink-0 rounded bg-surface-2 px-2 py-0.5 text-xs text-ink-2">被匯入 {m.import_count}</span>
                  )}
                </div>
                <MediaPreview m={m} />
                {m.main_text ? (
                  <div className="whitespace-pre-wrap text-sm text-ink">{m.main_text}</div>
                ) : (
                  <div className="text-sm text-ink-3">（無文案）</div>
                )}
                <div className="mt-3 flex items-center gap-2">
                  <ImportSharedButton id={m.id} />
                  {reviewer && <ReviewButton id={m.id} status={m.review_status} />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
