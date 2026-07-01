import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getAdminStats, getFeatureFlags, listSharedForReview, listTopContributors, isPublishPaused, getHeartbeat, listUsersOverview, listThreadsAccountsStatus, listRecentSponsorRecords, type ThreadsAccountStatusRow } from "@/lib/store";
import { contributionBadge } from "@/lib/roles";
import { isDemoMode } from "@/lib/env";
import { cronHeartbeatStatus } from "@/lib/cron-status";
import { tokenExpiryState } from "@/lib/token-expiry";
import { cloudinaryThumb, videoFirstFrameSrc } from "@/lib/img";
import { log } from "@/lib/logger";
import FeatureFlagsForm from "@/components/FeatureFlagsForm";
import RoleGrantForm from "@/components/RoleGrantForm";
import ReviewButton from "@/components/ReviewButton";
import PublishControlPanel from "@/components/PublishControlPanel";
import AdminUsersPanel from "@/components/AdminUsersPanel";
import AdminAccountsPanel, { type AccountStatusView } from "@/components/AdminAccountsPanel";
import AdminSponsorPanel from "@/components/AdminSponsorPanel";

// server 端把帳號狀態列轉成顯示資料（token 到期文案、斷路器剩餘），避免 client 端 Date.now() 造成 hydration 不一致。
function toAccountStatusView(row: ThreadsAccountStatusRow, nowMs: number): AccountStatusView {
  const exp = tokenExpiryState(row.tokenExpiresAt, 7, nowMs);
  const token =
    exp.level === "unknown"
      ? { tone: "text-ink-3", text: "未知" }
      : exp.level === "expired"
        ? { tone: "text-red-600", text: "已過期" }
        : exp.level === "soon"
          ? { tone: "text-amber-600", text: `${exp.daysLeft} 天後到期` }
          : { tone: "text-ink-2", text: `${exp.daysLeft} 天後到期` };
  let circuitText: string | null = null;
  if (row.circuitUntil) {
    const mins = Math.max(0, Math.round((Date.parse(row.circuitUntil) - nowMs) / 60000));
    circuitText = `冷卻中（約 ${mins} 分鐘）`;
  }
  return {
    id: row.id,
    label: row.label,
    ownerEmail: row.ownerEmail,
    threadsUserId: row.threadsUserId,
    status: row.status,
    token,
    circuitText
  };
}

export const dynamic = "force-dynamic";

// 管理員專屬：站台統計、功能開關、身份組賦予、共享素材審核。對非管理員隱藏（導覽列入口也只有 owner 可見）。
export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  if (!user.isOwner) redirect("/");

  const [stats, flags, queue, leaders, users, accountStatus, sponsorRecords] = await Promise.all([
    getAdminStats().catch(() => null),
    getFeatureFlags(),
    listSharedForReview(100).catch(() => []),
    listTopContributors(10).catch(() => []),
    listUsersOverview().catch(() => null),
    listThreadsAccountsStatus().catch(() => null),
    listRecentSponsorRecords(50).catch(() => null)
  ]);
  const accountViews = accountStatus ? accountStatus.map((r) => toAccountStatusView(r, Date.now())) : null;

  // 發文急停／心跳是 owner 控制台的關鍵狀態：讀取失敗不可偽裝成「未暫停／未啟用」，
  // 改以 null 表「未知（讀取失敗）」並在面板明確標示，避免誤判系統真實狀態。
  let paused: boolean | null = null;
  try {
    paused = await isPublishPaused();
  } catch (e) {
    log.error("管理頁讀取發文暫停狀態失敗", { err: e });
  }
  let heartbeat: string | null = null;
  let heartbeatError = false;
  try {
    heartbeat = await getHeartbeat();
  } catch (e) {
    heartbeatError = true;
    log.error("管理頁讀取排程心跳失敗", { err: e });
  }
  const cron = heartbeatError
    ? { tone: "text-amber-600", text: "⚠️ 排程心跳讀取失敗" }
    : cronHeartbeatStatus(heartbeat, Date.now());

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

      {!isDemoMode && <PublishControlPanel initialPaused={paused ?? false} pausedUnknown={paused === null} cron={cron} />}

      <div className="grid gap-4 lg:grid-cols-2">
        <FeatureFlagsForm initial={flags} />
        <RoleGrantForm />
      </div>

      {!isDemoMode &&
        (users ? (
          <AdminUsersPanel users={users} />
        ) : (
          <div className="card p-4 text-sm text-amber-600">⚠️ 使用者清單讀取失敗，請稍後重整。</div>
        ))}

      {!isDemoMode &&
        (accountViews ? (
          <AdminAccountsPanel accounts={accountViews} />
        ) : (
          <div className="card p-4 text-sm text-amber-600">⚠️ 帳號狀態讀取失敗，請稍後重整。</div>
        ))}

      {!isDemoMode &&
        (sponsorRecords ? (
          <AdminSponsorPanel records={sponsorRecords} />
        ) : (
          <div className="card p-4 text-sm text-amber-600">⚠️ 贊助文紀錄讀取失敗，請稍後重整。</div>
        ))}

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
                    <span className="text-ink" translate="no">{c.display_name || (c.bio_handle ? `@${c.bio_handle}` : "（未設暱稱）")}</span>
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
        <p className="mb-3 text-sm text-ink-2">
          下架低品質或不當來源；已下架者不再出現在共享庫。請比對「商品連結、媒體、名稱」是否一致（點媒體可看原圖/影片、點連結可開商品頁核對）。
        </p>
        {queue.length === 0 ? (
          <p className="text-sm text-ink-3">目前沒有共享素材。</p>
        ) : (
          <div className="divide-y divide-border">
            {queue.map((m) => (
              <div key={m.id} className="flex items-start gap-3 py-3">
                {m.cloudinary_media_url && m.media_type !== "none" ? (
                  // 點媒體開新分頁看原檔，方便核對媒體是否與商品相符。
                  <a href={m.cloudinary_media_url} target="_blank" rel="noopener noreferrer" className="shrink-0" title="開啟原始媒體核對">
                    {m.media_type === "video" ? (
                      // 影片用 <video> 首幀當縮圖；純裝飾：aria-hidden＋tabIndex=-1（免字幕軌要求）。
                      <video
                        src={videoFirstFrameSrc(m.cloudinary_media_url)}
                        muted
                        playsInline
                        preload="metadata"
                        aria-hidden="true"
                        tabIndex={-1}
                        className="h-20 w-20 rounded-lg border object-cover"
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cloudinaryThumb(m.cloudinary_media_url, 160)} alt="" role="presentation" loading="lazy" referrerPolicy="no-referrer" className="h-20 w-20 rounded-lg border object-cover" />
                    )}
                  </a>
                ) : (
                  <span className="grid h-20 w-20 shrink-0 place-items-center rounded-lg border bg-surface-2 text-xs text-ink-3">無媒體</span>
                )}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="break-words text-sm font-medium text-ink">{m.product_name ?? "（未命名商品）"}</div>
                  {m.clean_product_url ? (
                    <a href={m.clean_product_url} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-brand hover:underline" title={m.clean_product_url}>
                      🔗 商品連結：{m.clean_product_url}
                    </a>
                  ) : (
                    <div className="text-xs text-warn">⚠️ 無商品連結</div>
                  )}
                  {m.main_text && <p className="line-clamp-2 whitespace-pre-wrap text-xs text-ink-2">{m.main_text}</p>}
                  <div className="text-xs text-ink-3">
                    {(m.media_type && m.media_type !== "none" ? (m.media_type === "video" ? "🎬 影片" : "🖼️ 圖片") : "無媒體")}・匯入 {m.import_count}・收藏 {m.favorite_count}
                    {m.review_status === "removed" && <span className="ml-1 text-warn">・已下架</span>}
                    {m.affiliate_valid === false && <span className="ml-1 text-warn" title="連結健檢判定失效，已自動暫時從共享庫下架；連結復活後自動恢復">・🔗 連結失效（暫時下架）</span>}
                  </div>
                </div>
                <div className="shrink-0">
                  <ReviewButton id={m.id} status={m.review_status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
