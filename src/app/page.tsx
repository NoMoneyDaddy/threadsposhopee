import RunPipelineButton from "@/components/RunPipelineButton";
import { listDrafts, listSources, listThreadsAccounts } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [drafts, sources, accounts] = await Promise.all([
    listDrafts(),
    listSources(),
    listThreadsAccounts()
  ]);

  const pending = drafts.filter((d) => d.status === "draft").length;
  const published = drafts.filter((d) => d.status === "published").length;

  const stats = [
    { label: "Threads 帳號", value: accounts.length },
    { label: "監看來源", value: sources.filter((s) => s.enabled).length },
    { label: "待審文案", value: pending },
    { label: "已發布", value: published }
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">儀表板</h1>
        <RunPipelineButton />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border bg-white p-4">
            <div className="text-sm text-neutral-500">{s.label}</div>
            <div className="mt-1 text-3xl font-bold">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border bg-white p-5">
        <h2 className="mb-2 font-semibold">流程概覽</h2>
        <ol className="flex flex-wrap items-center gap-2 text-sm text-neutral-600">
          {["爬來源貼文", "去重", "還原蝦皮短網址", "換自己分潤連結", "取商品名", "AI 文案(humanizer)", "存草稿", "審核/排程", "發 Threads"].map(
            (step, i) => (
              <li key={step} className="flex items-center gap-2">
                <span className="rounded-md bg-neutral-100 px-2 py-1">{step}</span>
                {i < 8 && <span className="text-neutral-300">→</span>}
              </li>
            )
          )}
        </ol>
      </div>
    </div>
  );
}
