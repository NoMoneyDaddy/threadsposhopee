import { getScrapeConfig, hasApifyCredentials } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { getApifyUsage } from "@/services/apify/usage";
import ScrapeConfigForm from "@/components/ScrapeConfigForm";
import RunPipelineButton from "@/components/RunPipelineButton";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const user = await getCurrentUser();
  // 未登入（且非 demo）不可用 demo-user 當後備查資料（service-role 僅以 owner_id 過濾，後備 id 會變存取金鑰）。
  if (!user && !isDemoMode) {
    return <div className="rounded-2xl border border-dashed p-10 text-center text-ink-2">請先登入。</div>;
  }
  // 自動抓文（Apify）為平台管理員專屬功能；一般成員不開放。
  if (user && !user.isOwner && !isDemoMode) {
    return <div className="rounded-2xl border border-dashed p-10 text-center text-ink-2">此功能僅平台管理員可使用。</div>;
  }
  const ownerId = user?.id ?? "demo-user";

  // 抓取：綁定自己的 Apify 金鑰即可使用（計費算在自己帳上）。未綁先引導去綁。
  // demo 模式（無金鑰）照常顯示頁面，方便試用與 e2e 煙霧測試。
  const apify = isDemoMode ? { bound: true } : await hasApifyCredentials(ownerId);
  if (!apify.bound && !isDemoMode) {
    return (
      <div className="space-y-3 rounded-2xl border border-dashed p-10 text-center text-ink-2">
        <p>抓文生素材需要你自己的 Apify 金鑰（抓取靠它，費用也算在你的 Apify 帳號）。</p>
        <p>
          <a href="/accounts#setup-apify" className="text-brand underline">
            前往帳號管理綁定 Apify 金鑰
          </a>
        </p>
        <p className="text-xs text-ink-3">
          Apify 免費帳號每月約 US$5 平台額度；本工具使用的 actor「igview-owner/threads-search-scraper」計費約
          US$5 / 每 1,000 筆結果起（以 Apify 商店頁為準）。
        </p>
      </div>
    );
  }

  const [config, usage] = await Promise.all([getScrapeConfig(ownerId), isDemoMode ? Promise.resolve(null) : getApifyUsage(ownerId)]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">抓文生素材</h1>
      <p className="text-sm text-ink-2">
        設定<b>關鍵字</b>，系統會去 Threads 搜含該關鍵字的貼文、把符合的換成你的分潤連結，產生「素材」進<b>待審</b>
        （不綁發文帳號、不自動發文）。之後到「素材」頁逐筆核准，再挑選一鍵轉貼文／排程。
      </p>

      {usage && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-surface p-3 text-sm">
          <span className="font-medium">Apify 本月額度</span>
          <span className="text-ink-2">
            已用 US$ {usage.usedUsd.toFixed(2)}
            {usage.limitUsd != null
              ? ` / 上限 US$ ${usage.limitUsd.toFixed(2)}`
              : "（查無月上限）"}
          </span>
          {usage.remainingUsd != null && (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                usage.remainingUsd <= 0 ? "bg-red-50 text-red-600" : usage.remainingUsd < 1 ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"
              }`}
            >
              剩 US$ {usage.remainingUsd.toFixed(2)}
            </span>
          )}
        </div>
      )}

      <ScrapeConfigForm initial={config} />

      <div className="rounded-2xl border bg-surface p-4">
        <div className="mb-1 font-medium">立即抓取</div>
        <p className="mb-2 text-xs text-ink-3">
          用你自己的 Apify 金鑰跑一次上面所有關鍵字（費用算你帳上）；抓到的素材會進待審，到「素材」頁核准。
        </p>
        <RunPipelineButton />
      </div>
    </div>
  );
}
