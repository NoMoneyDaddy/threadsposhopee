import EmptyState from "@/components/EmptyState";
import ImportSharedButton from "@/components/ImportSharedButton";
import RewardModeForm from "@/components/RewardModeForm";
import BadgeRow from "@/components/BadgeRow";
import FavoriteButton from "@/components/FavoriteButton";
import ReviewButton from "@/components/ReviewButton";
import {
  listSharedMaterials,
  getContributionScore,
  getSponsorRewardMode,
  getFeatureFlags,
  getRoles,
  listTopContributors,
  listFavoritedIds
} from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";
import { cloudinaryThumb } from "@/lib/img";
import { SPONSOR_EXEMPT_CONTRIBUTION } from "@/lib/contribution";
import { badgesFor, isReviewer, contributionBadge, isTopMaterial } from "@/lib/roles";

export const dynamic = "force-dynamic";

// 共享素材庫：瀏覽其他人分享的商品，用自己的金鑰匯入（分潤算自己）。
// 含身份組勳章、貢獻排行榜、收藏（高黏著度）、頂級素材標記與審查員審核。
export default async function SharedPage() {
  const user = await getCurrentUser();
  if (!user) return <div className="text-center text-sm text-red-500">請先登入。</div>;

  const flags = await getFeatureFlags();
  if (!flags.shared) {
    return <EmptyState icon="🚧" title="共享庫目前未開放" hint="管理員已暫時關閉此功能，請稍後再來。" />;
  }

  const [items, contribution, rewardMode, roles, leaders] = await Promise.all([
    listSharedMaterials(user.id).catch(() => []),
    getContributionScore(user.id).catch(() => 0),
    getSponsorRewardMode(user.id).catch(() => "exempt" as const),
    getRoles(user.id).catch(() => []),
    flags.leaderboard ? listTopContributors(5).catch(() => []) : Promise.resolve([])
  ]);
  const favorited = flags.favorites
    ? await listFavoritedIds(user.id, items.map((m) => m.id)).catch(() => new Set<string>())
    : new Set<string>();

  const exempt = contribution >= SPONSOR_EXEMPT_CONTRIBUTION;
  const reviewer = isReviewer(roles, user.isOwner);
  const myBadges = badgesFor({ score: contribution, roles, isOwner: user.isOwner });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">共享庫</h1>
          <p className="text-sm text-ink-2">
            別人分享的商品，按「匯入」會用<b>你自己的蝦皮金鑰</b>重產分潤連結（分潤算你的）。
          </p>
        </div>
        <span
          className={`badge ${exempt ? "badge-success" : "badge-neutral"}`}
          title={`你分享的商品被匯入 ${contribution} 次；達 ${SPONSOR_EXEMPT_CONTRIBUTION} 次可享高貢獻回饋`}
        >
          🏅 貢獻 {contribution}{exempt ? "（已達門檻）" : `／${SPONSOR_EXEMPT_CONTRIBUTION}`}
        </span>
      </div>

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
                  <span className="text-ink">{c.bio_handle ? `@${c.bio_handle}` : `會員#${c.owner_id.slice(0, 4)}`}</span>
                </span>
                <span className="tabular-nums text-ink-2">{c.score}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {exempt && <RewardModeForm initial={rewardMode} />}

      {items.length === 0 ? (
        <EmptyState
          icon="🤝"
          title="共享庫目前沒有商品"
          hint="到「素材」把賺錢的商品按「分享到共享庫」，大家都能用自己的金鑰匯入；你被匯入越多、貢獻越高。"
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((m) => {
            const top = isTopMaterial(m.import_count, m.favorite_count);
            return (
              <div key={m.id} className="flex flex-col rounded-2xl border bg-surface p-4">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-medium text-ink">
                    {top && <span className="mr-1" title="頂級素材（高匯入＋高收藏）">🔥</span>}
                    {m.product_name ?? "（商品）"}
                  </span>
                  {m.import_count > 0 && (
                    <span className="shrink-0 rounded bg-surface-2 px-2 py-0.5 text-xs text-ink-2">被匯入 {m.import_count}</span>
                  )}
                </div>
                {m.cloudinary_media_url && m.media_type !== "none" && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cloudinaryThumb(m.cloudinary_media_url, 600)} alt="" loading="lazy" className="mb-2 h-32 w-full rounded object-cover" />
                )}
                {m.main_text ? (
                  <div className="whitespace-pre-wrap text-sm text-ink">{m.main_text}</div>
                ) : (
                  <div className="text-sm text-ink-3">（無文案）</div>
                )}
                <div className="mt-3 flex items-center gap-2">
                  <ImportSharedButton id={m.id} />
                  {flags.favorites && <FavoriteButton id={m.id} initial={favorited.has(m.id)} count={m.favorite_count} />}
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
