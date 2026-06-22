import EmptyState from "@/components/EmptyState";
import ImportSharedButton from "@/components/ImportSharedButton";
import { listSharedMaterials, getContributionScore } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";
import { cloudinaryThumb } from "@/lib/img";
import { SPONSOR_EXEMPT_CONTRIBUTION } from "@/lib/contribution";

export const dynamic = "force-dynamic";

// 共享素材庫：瀏覽其他人分享的商品，用自己的金鑰匯入（分潤算自己）。
export default async function SharedPage() {
  const user = await getCurrentUser();
  if (!user) return <div className="text-center text-sm text-red-500">請先登入。</div>;
  const [items, contribution] = await Promise.all([
    listSharedMaterials(user.id).catch(() => []),
    getContributionScore(user.id).catch(() => 0)
  ]);
  const exempt = contribution >= SPONSOR_EXEMPT_CONTRIBUTION;

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
          title={`你分享的商品被匯入 ${contribution} 次；達 ${SPONSOR_EXEMPT_CONTRIBUTION} 次可免每日贊助文`}
        >
          🏅 貢獻 {contribution}{exempt ? "（已免贊助文）" : `／${SPONSOR_EXEMPT_CONTRIBUTION}`}
        </span>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon="🤝"
          title="共享庫目前沒有商品"
          hint="到「素材」把賺錢的商品按「分享到共享庫」，大家都能用自己的金鑰匯入；你被匯入越多、貢獻越高。"
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((m) => (
            <div key={m.id} className="flex flex-col rounded-2xl border bg-surface p-4">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-medium text-ink">{m.product_name ?? "（商品）"}</span>
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
              <div className="mt-3">
                <ImportSharedButton id={m.id} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
