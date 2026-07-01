import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { listAiAgents } from "@/lib/agents-store";
import { listThreadsAccounts } from "@/lib/accounts-store";
import AgentManager from "@/components/AgentManager";

export const dynamic = "force-dynamic";

// AI 部落客：人格×領域，定時抓新聞→改寫→草稿（預設待審；可設免審直接排程）。僅管理員可見。
export default async function AgentsPage() {
  const user = await getCurrentUser();
  if (!user) return <div className="text-center text-sm text-red-500">請先登入。</div>;
  if (!user.isOwner) redirect("/"); // 僅管理員可用 AI 部落客
  const [agents, accounts] = await Promise.all([
    listAiAgents(user.id).catch(() => []),
    listThreadsAccounts(user.id).catch(() => [])
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">AI 部落客</h1>
        <p className="text-sm text-ink-2">
          選人格×領域，系統每日抓當日新聞改寫成貼文，預設進草稿待你核准；也可設「免審直接排程」全自動發文。需先綁定 Gemini 金鑰。
        </p>
      </div>
      <AgentManager
        agents={agents.map((a) => ({
          id: a.id,
          name: a.name,
          domain: a.domain,
          domains: a.domains ?? [],
          tone: a.tone ?? "",
          source_mode: a.source_mode,
          search_query: a.search_query ?? "",
          enabled: a.enabled,
          last_run_at: a.last_run_at,
          use_redirect: a.use_redirect,
          auto_publish: a.auto_publish,
          threads_account_id: a.threads_account_id
        }))}
        accounts={accounts.map((a) => ({ id: a.id, label: a.label }))}
      />
    </div>
  );
}
