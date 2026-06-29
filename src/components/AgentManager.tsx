"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AI_DOMAINS } from "@/lib/ai-domains";
import { FieldHint } from "@/components/FieldHint";

// 口吻/風格預設選項（空字串＝自動，由 AI 依內容選最合適口吻）。
const TONE_PRESETS = ["理性分析", "幽默吐槽", "溫暖療癒", "專業開箱", "親切閒聊", "熱血推坑", "知性科普"];

interface Agent {
  id: string;
  name: string;
  domain: string;
  domains: string[];
  enabled: boolean;
  last_run_at: string | null;
  use_redirect: boolean;
  auto_publish: boolean;
  threads_account_id: string | null;
}
interface AccountOpt {
  id: string;
  label: string | null;
}

// AI 部落客管理：建立 ＋ 列表（開關/立即跑/刪除）。
export default function AgentManager({ agents, accounts }: { agents: Agent[]; accounts: AccountOpt[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [domains, setDomains] = useState<string[]>([AI_DOMAINS[0].id]);
  const [sourceMode, setSourceMode] = useState<"rss" | "threads_search">("rss");
  const [searchQuery, setSearchQuery] = useState("");
  const [tone, setTone] = useState("");
  const [customTone, setCustomTone] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [useRedirect, setUseRedirect] = useState(false);
  const [autoPublish, setAutoPublish] = useState(false);
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
        domains,
        source_mode: sourceMode,
        search_query: searchQuery,
        tone,
        threads_account_id: accountId || null,
        use_redirect: useRedirect,
        auto_publish: autoPublish
      });
      if (!r.ok) throw new Error(r.error);
      setName("");
      setTone("");
      setCustomTone(false); // 一併重置，避免表單卡在「自訂…」模式（下筆送出空 tone）
      setSearchQuery("");
      setSourceMode("rss");
      setAutoPublish(false);
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
  function toggleDomain(id: string) {
    setDomains((prev) => {
      if (!prev.includes(id)) return [...prev, id];
      return prev.length === 1 ? prev : prev.filter((d) => d !== id); // 至少保留一個領域
    });
  }

  async function toggleAuto(a: Agent) {
    if (!a.auto_publish) {
      if (!a.threads_account_id) {
        alert("❌ 此部落客未指定發文帳號，無法開啟免審直接排程。請重新建立並指定帳號。");
        return;
      }
      if (!confirm(`開啟「免審直接排程」後，部落客「${a.name}」產出的貼文會自動發文、不經人工審核。確定開啟？`)) return;
    }
    setBusy(a.id);
    try {
      const r = await api(`/api/agents/${a.id}`, "PATCH", { auto_publish: !a.auto_publish });
      if (!r.ok) throw new Error(r.error || "更新失敗");
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }
  async function runNow(a: Agent) {
    setBusy(a.id);
    setMsg(null);
    const r = await api("/api/agents/run", "POST", { id: a.id }).catch(() => ({ ok: false, error: "失敗" }));
    setMsg(r.ok ? "✅ 已產生 1 篇（依部落客設定進待審草稿或自動排程）。" : `⚠️ ${r.error}`);
    router.refresh();
    setBusy(null);
  }
  async function remove(a: Agent) {
    if (!confirm(`刪除部落客「${a.name}」？`)) return;
    setBusy(a.id);
    await api(`/api/agents/${a.id}`, "DELETE").catch(() => {});
    router.refresh();
    setBusy(null);
  }

  const domLabel = (id: string) => AI_DOMAINS.find((d) => d.id === id)?.label ?? id;
  const accLabel = (id: string | null) => (id ? accounts.find((a) => a.id === id)?.label ?? id : null);

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="card-p space-y-3">
        <h2 className="section-title">新增部落客</h2>
        <div>
          <label className="label" htmlFor="ag-name">名稱</label>
          <input id="ag-name" className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="例：科技宅阿哲" />
        </div>
        <div>
          <span className="label">領域（可複選，橫跨多種主題）</span>
          <div className="flex flex-wrap gap-1.5">
            {AI_DOMAINS.map((d) => {
              const on = domains.includes(d.id);
              return (
                <button
                  type="button"
                  key={d.id}
                  onClick={() => toggleDomain(d.id)}
                  className={on ? "badge-brand cursor-pointer" : "badge-neutral cursor-pointer opacity-70"}
                  aria-pressed={on}
                >
                  {on ? "✓ " : ""}{d.label}
                </button>
              );
            })}
          </div>
          <FieldHint>選了多個領域，部落客就會輪流從這幾個主題找題材。至少選一個。</FieldHint>
        </div>
        <div>
          <label className="label" htmlFor="ag-source">取材來源</label>
          <select
            id="ag-source"
            className="input"
            value={sourceMode}
            onChange={(e) => setSourceMode(e.target.value === "threads_search" ? "threads_search" : "rss")}
          >
            <option value="rss">Google News（依領域/關鍵字抓新聞）</option>
            <option value="threads_search">Threads 關鍵字搜尋（抓熱門公開貼文選題）</option>
          </select>
          <FieldHint>
            {sourceMode === "threads_search"
              ? "用你綁定的 Threads 帳號搜尋熱門公開貼文當素材（需該帳號已授權關鍵字搜尋權限）。查詢詞用下方關鍵字，留空則用領域名稱。"
              : "從 Google News 依領域或自訂關鍵字抓新聞當素材。"}
          </FieldHint>
        </div>
        {(domains.includes("custom") || sourceMode === "threads_search") && (
          <div>
            <label className="label" htmlFor="ag-q">
              {domains.includes("custom") ? "自訂主題關鍵字（必填）" : "搜尋關鍵字（選填，留空用領域名稱）"}
            </label>
            <input
              id="ag-q"
              className="input"
              required={domains.includes("custom")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="例：露營 裝備、植物 園藝"
            />
          </div>
        )}
        <div>
          <label className="label" htmlFor="ag-tone">口吻/風格</label>
          <select
            id="ag-tone"
            className="input"
            value={customTone ? "__custom__" : TONE_PRESETS.includes(tone) ? tone : ""}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "__custom__") {
                setCustomTone(true);
                setTone("");
              } else {
                setCustomTone(false);
                setTone(v); // "" = 自動（依內容選口吻）
              }
            }}
          >
            <option value="">自動（依內容選最合適口吻）</option>
            {TONE_PRESETS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
            <option value="__custom__">自訂…</option>
          </select>
          {customTone && (
            <input
              className="input mt-2"
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              placeholder="自訂口吻，如：理性、愛吐槽、用比喻"
              aria-label="自訂口吻"
            />
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="ag-acc">發文帳號（選填，可留草稿再指定）</label>
            <select
              id="ag-acc"
              className="input"
              value={accountId}
              onChange={(e) => {
                setAccountId(e.target.value);
                if (!e.target.value) setAutoPublish(false); // 取消帳號＝免審直發失去依據
              }}
            >
              <option value="">（不指定）</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.label ?? a.id}</option>
              ))}
            </select>
          </div>
          <label className="flex items-end gap-2 pb-2 text-sm text-ink-2">
            <input type="checkbox" checked={useRedirect} onChange={(e) => setUseRedirect(e.target.checked)} />
            來源連結改用短連結（可順便附分潤）
          </label>
        </div>
        <div>
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input
              type="checkbox"
              checked={autoPublish}
              onChange={(e) => {
                if (e.target.checked && !accountId) {
                  alert("❌ 請先選擇「發文帳號」，才能開啟免審直接排程");
                  return;
                }
                setAutoPublish(e.target.checked);
              }}
            />
            免審直接排程（自動發文）
          </label>
          {autoPublish ? (
            <FieldHint tone="warn">
              部落客產出的貼文將不經人工審核，自動排進你的發文時段直接發出。請確認領域/口吻設定無誤，內容違規或失準的風險由你自負。
            </FieldHint>
          ) : (
            <FieldHint>預設關閉：部落客產文一律進草稿待你審核，核准後才發布。可隨時於下方清單調整。</FieldHint>
          )}
        </div>
        <button type="submit" disabled={busy === "create"} className="btn btn-brand">
          {busy === "create" ? "建立中…" : "建立部落客"}
        </button>
        {msg && <p className="text-sm text-ink-2">{msg}</p>}
      </form>

      <section className="rounded-2xl border bg-surface p-5">
        <h2 className="section-title mb-3">我的部落客</h2>
        {agents.length === 0 ? (
          <p className="text-sm text-ink-3">還沒有部落客。建立後可「立即跑一篇」或開啟每日自動產文（預設進草稿待審）。</p>
        ) : (
          <ul className="divide-y divide-border">
            {agents.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {a.name}{" "}
                    <span className="badge-neutral ml-1">
                      {(a.domains?.length ? a.domains : [a.domain]).map(domLabel).join("、")}
                    </span>
                    {a.use_redirect && <span className="badge-brand ml-1">短連結</span>}
                    {a.auto_publish && <span className="badge-brand ml-1">免審直發</span>}
                    {accLabel(a.threads_account_id) ? (
                      <span className="badge-neutral ml-1">發文：{accLabel(a.threads_account_id)}</span>
                    ) : (
                      <span className="badge-neutral ml-1 opacity-70">未指定帳號</span>
                    )}
                  </div>
                  <div className="text-xs text-ink-3">
                    {a.enabled ? (a.auto_publish ? "每日自動產文＋免審直接發" : "每日自動產文（待審）") : "已停用"}
                    {a.last_run_at && ` · 上次 ${new Date(a.last_run_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}`}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button disabled={!!busy} onClick={() => runNow(a)} className="btn btn-outline btn-sm">立即跑一篇</button>
                  <button disabled={!!busy} onClick={() => toggleAuto(a)} className="btn btn-sm btn-ghost" title="切換免審直接排程">
                    {a.auto_publish ? "改回待審" : "改免審直發"}
                  </button>
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
