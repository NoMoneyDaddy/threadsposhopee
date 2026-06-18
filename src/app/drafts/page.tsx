import DraftActions from "@/components/DraftActions";
import { listDrafts } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function DraftsPage() {
  const drafts = await listDrafts();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">文案佇列</h1>
      <p className="text-sm text-neutral-500">AI 生成的草稿在此審核。核准後發到 Threads，分潤連結自動放留言區。</p>

      <div className="grid gap-4 md:grid-cols-2">
        {drafts.map((d) => (
          <div key={d.id} className="flex flex-col rounded-lg border bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-neutral-700">{d.product_name ?? "（未知商品）"}</span>
              <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">{d.status}</span>
            </div>

            {d.cloudinary_media_url && d.media_type !== "none" && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={d.cloudinary_media_url}
                alt=""
                className="mb-3 h-40 w-full rounded object-cover"
              />
            )}

            <div className="whitespace-pre-wrap text-sm text-neutral-800">{d.main_text}</div>
            <div className="mt-2 rounded bg-neutral-50 p-2 text-xs text-neutral-500 whitespace-pre-wrap">
              💬 {d.reply_text}
            </div>

            <div className="mt-3 flex items-center justify-between">
              <a
                href={d.shopee_short_link ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-shopee hover:underline"
              >
                {d.shopee_short_link}
              </a>
              <DraftActions id={d.id} status={d.status} />
            </div>
          </div>
        ))}
        {drafts.length === 0 && (
          <div className="col-span-2 rounded-lg border border-dashed p-10 text-center text-neutral-400">
            還沒有草稿。回儀表板按「立即跑一次」產生。
          </div>
        )}
      </div>
    </div>
  );
}
