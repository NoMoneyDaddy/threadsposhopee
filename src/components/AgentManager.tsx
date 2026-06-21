"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AI_DOMAINS } from "@/lib/ai-domains";

interface Agent {
  id: string;
  name: string;
  domain: string;
  enabled: boolean;
  last_run_at: string | null;
  use_redirect: boolean;
}
interface AccountOpt {
  id: string;
  label: string | null;
}

// AI 代理人管理：建立 ＋ 列表（開關/立即跑/刪除）。
export default function AgentManager({ agents, accounts }: { agents: Agent[]; accounts: AccountOpt[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [domain, setDomain] = useState(AI_DOMAINS[0].id);
  const [searchQuery, setSearchQuery] = useState("");
  const [tone, setTone] = useState("");
  const [accountId, setAccountId] = useState("");
  const [useRedirect, setUseRedirect] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function api(url: string, method: string, body?: unknown) {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined
    });
    return res.json();
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy("create");
    setMsg(null);
    try {
      const r = await api("/api/agents", "POST", {
        name,
        domain,
        search_query: searchQuery,
        tone,
        threads_account_id: accountId || null,
        use_redirect: useRedirect
      });
      if (!r.ok) throw new Error(r.error);
      setName("");
      setTone("");
      setSearchQuery("");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function toggle(a: Agent) {
    setBusy(a.id);
    await api(`/api/agents/${a.id}`, "PATCH", { enabled: !a.enabled }).catch(() => {});
    router.refresh();
    setBusy(null);
  }
  async function runNow(a: Agent) {
    setBusy(a.id);
    setMsg(null);
    const r = await api("/api/agents/run", "POST", { id: a.id }).catch(() => ({ ok: false, error: "失敗" }));
    setMsg(r.ok ? "✅ 已產生 1 篇草稿，請到草稿頁審核。" : `⚠️ ${r.error}`);
    router.refresh();
    setBusy(null);
  }
  async function remove(a: Agent) {
    if (!confirm(`刪除代理人「${a.name}」？`)) return;
    setBusy(a.id);
    await api(`/api/agents/${a.id}`, "DELETE").catch(() => {});
    router.refresh();
    setBusy(null);
  }

  const domLabel = (id: string) => AI_DOMAINS.find((d) => d.id === id)?.label ?? id;

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="card-p space-y-3">
        <h2 className="section-title">新增代理人</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="ag-name">名稱</label>
            <input id="ag-name" className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="例：科技宅阿哲" />
          </div>
          <div>
            <label className="label" htmlFor="ag-domain">領域</label>
            <select id="ag-domain" className="input" value={domain} onChange={(e) => setDomain(e.target.value)}>
              {AI_DOMAINS.map((d) => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
          </div>
        </div>
        {domain === "custom" && (
          <div>
            <label className="label" htmlFor="ag-q">自訂主題關鍵字（必填）</label>
            <input id="ag-q" className="input" required value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="例：露營 裝備、植物 園藝" />
          </div>
        )}
        <div>
          <label className="label" htmlFor="ag-tone">口吻/風格（選填）</label>
          <input id="ag-tone" className="input" value={tone} onChange={(e) => setTone(e.target.value)} placeholder="理性、愛吐槽、用比喻" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="ag-acc">發文帳號（選填，可留草稿再指定）</label>
            <select id="ag-acc" className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">（不指定）</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.label ?? a.id}</option>
              ))}
            </select>
          </div>
          <label className="flex items-end gap-2 pb-2 text-sm text-ink-2">
            <input type="checkbox" checked={useRedirect} onChange={(e) => setUseRedirect(e.target.checked)} />
            來源連結走 go2read 短連結（可附分潤）
          </label>
        </div>
        <button type="submit" disabled={busy === "create"} className="btn btn-brand">
          {busy === "create" ? "建立中…" : "建立代理人"}
        </button>
        {msg && <p className="text-sm text-ink-2">{msg}</p>}
      </form>

      <section className="rounded-2xl border bg-surface p-5">
        <h2 className="section-title mb-3">我的代理人</h2>
        {agents.length === 0 ? (
          <p className="text-sm text-ink-3">還沒有代理人。建立後可「立即跑一篇」或開啟每日自動產文（皆進草稿待審）。</p>
        ) : (
          <ul className="divide-y divide-border">
            {agents.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {a.name} <span className="badge-neutral ml-1">{domLabel(a.domain)}</span>
                    {a.use_redirect && <span className="badge-brand ml-1">短連結</span>}
                  </div>
                  <div className="text-xs text-ink-3">
                    {a.enabled ? "每日自動產文（待審）" : "已停用"}
                    {a.last_run_at && ` · 上次 ${new Date(a.last_run_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}`}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button disabled={!!busy} onClick={() => runNow(a)} className="btn btn-outline btn-sm">立即跑一篇</button>
                  <button disabled={!!busy} onClick={() => toggle(a)} className="btn btn-sm btn-ghost">
                    {a.enabled ? "停用" : "啟用"}
                  </button>
                  <button disabled={!!busy} onClick={() => remove(a)} className="btn btn-danger btn-sm">刪除</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
