import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getAdminStats, getFeatureFlags, listSharedForReview, listTopContributors, isPublishPaused, getHeartbeat } from "@/lib/store";
import { contributionBadge } from "@/lib/roles";
import { isDemoMode } from "@/lib/env";
import { cloudinaryThumb } from "@/lib/img";
import FeatureFlagsForm from "@/components/FeatureFlagsForm";
import RoleGrantForm from "@/components/RoleGrantForm";
import ReviewButton from "@/components/ReviewButton";
import PublishControlPanel from "@/components/PublishControlPanel";

export const dynamic = "force-dynamic";

// 管理員專屬：站台統計、功能開關、身份組賦予、共享素材審核。對非管理員隱藏（導覽列入口也只有 owner 可見）。
export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  if (!user.isOwner) redirect("/");

  const [stats, flags, queue, leaders, paused, heartbeat] = await Promise.all([
    getAdminStats().catch(() => null),
    getFeatureFlags(),
    listSharedForReview(100).catch(() => []),
    listTopContributors(10).catch(() => []),
    isPublishPaused().catch(() => false),
    getHeartbeat().catch(() => null)
  ]);

  const cards: { label: string; value: number }[] = stats
    ? [
        { label: "會員", value: stats.members },
        { label: "Threads 帳號", value: stats.threadsAccounts },
        { label: "草稿", value: stats.drafts },
        { label: "已發布", value: stats.published },
        { label: "共享素材", value: stats.sharedMaterials },
        { label: "匯入總數", value: stats.totalImports }
      ]
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">管理員</h1>
        <p className="text-sm text-ink-2">站台統計、功能開關、身份組與共享素材審核。僅管理員可見。</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => (
          <div key={c.label} className="card p-4">
            <div className="stat-num text-2xl">{c.value.toLocaleString()}</div>
            <div className="text-xs text-ink-3">{c.label}</div>
          </div>
        ))}
        {!stats && <div className="col-span-full text-sm text-ink-3">統計暫時無法載入。</div>}
      </div>

      {!isDemoMode && <PublishControlPanel initialPaused={paused} lastCronAt={heartbeat} />}

      <div className="grid gap-4 lg:grid-cols-2">
        <FeatureFlagsForm initial={flags} />
        <RoleGrantForm />
      </div>

      <div className="card p-4">
        <h2 className="mb-1 text-lg font-semibold">貢獻排行榜</h2>
        {leaders.length === 0 ? (
          <p className="text-sm text-ink-3">尚無貢獻資料。</p>
        ) : (
          <ol className="space-y-1">
            {leaders.map((c, i) => {
              const b = contributionBadge(c.score);
              return (
                <li key={c.owner_id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2">
                    <span className="w-6 tabular-nums text-ink-3">#{i + 1}</span>
                    <span>{b.emoji}</span>
                    <span className="text-ink">{c.bio_handle ? `@${c.bio_handle}` : "（未公開代稱）"}</span>
                  </span>
                  <span className="tabular-nums text-ink-2">{c.score}</span>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <div className="card p-4">
        <h2 className="mb-1 text-lg font-semibold">共享素材審核</h2>
        <p className="mb-3 text-sm text-ink-2">下架低品質或不當來源；已下架者不再出現在共享庫。</p>
        {queue.length === 0 ? (
          <p className="text-sm text-ink-3">目前沒有共享素材。</p>
        ) : (
          <div className="divide-y divide-border">
            {queue.map((m) => (
              <div key={m.id} className="flex items-center gap-3 py-2">
                {m.cloudinary_media_url && m.media_type !== "none" && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cloudinaryThumb(m.cloudinary_media_url, 80)} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink">{m.product_name ?? "（商品）"}</div>
                  <div className="text-xs text-ink-3">
                    匯入 {m.import_count}・收藏 {m.favorite_count}
                    {m.review_status === "removed" && <span className="ml-1 text-warn">・已下架</span>}
                  </div>
                </div>
                <ReviewButton id={m.id} status={m.review_status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
