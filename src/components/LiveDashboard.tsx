"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

interface DashboardData {
  at: string;
  isOwner: boolean;
  demo: boolean;
  services: Record<string, boolean | string>;
  stats: {
    threadsAccounts: number;
    sources: number;
    materials: number;
    drafts: { draft: number; approved: number; published: number; failed: number };
    publishedLast24h: number;
    accountIssues: { error: number; paused: number; tokenExpiring?: number };
    replies?: { pending: number; failed: number };
    invalidMaterials?: number;
    needsVerification?: number;
  };
  threadsQuota: { label: string; used: number; limit: number }[];
  cloudinary: { creditsUsed: number; creditsLimit: number; storageBytes: number; resources: number } | null;
  lastCronAt?: string | null;
  binds?: { apify: boolean; gemini: boolean; shopee: boolean } | null;
  publishPlan?: { id: string; productName: string | null; accountLabel: string; etaIso: string | null; reason: string }[];
  publishPaused?: boolean;
  accountsHealth?: { label: string; level: "ok" | "warn" | "error"; summary: string }[];
}

// 帳號健康分：每個 Threads 帳號的狀態＋token 到期一眼看出哪個要處理（問題優先）。
function AccountsHealth({ rows }: { rows: DashboardData["accountsHealth"] }) {
  if (!rows || rows.length === 0) return null;
  const dot: Record<string, string> = { ok: "bg-green-500", warn: "bg-amber-500", error: "bg-red-500" };
  const text: Record<string, string> = { ok: "text-ink-2", warn: "text-amber-700", error: "text-red-600" };
  return (
    <div className="card p-5">
      <h2 className="mb-3 font-semibold">帳號健康</h2>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2 text-sm">
            <span className={`h-2 w-2 shrink-0 rounded-full ${dot[r.level]}`} />
            <span className="min-w-0 truncate font-medium text-ink">{r.label}</span>
            <span className={`ml-auto shrink-0 text-xs ${text[r.level]}`}>{r.summary}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// 發文進度：排隊中的草稿預計何時發。多到一定量視為「塞車」。
function PublishPlan({ rows }: { rows: DashboardData["publishPlan"] }) {
  if (!rows || rows.length === 0) return null;
  const congested = rows.length >= 10; // 佇列累積較多 → 提示塞車
  const fmt = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString("zh-TW", {
          timeZone: "Asia/Taipei",
          month: "numeric",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        })
      : "—";
  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">發文排隊進度</h2>
        {congested && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
            🚦 塞車中（{rows.length} 篇待發）
          </span>
        )}
      </div>
      <table className="w-full text-sm">
        <thead className="sr-only">
          <tr>
            <th>帳號</th>
            <th>商品</th>
            <th>狀態</th>
            <th>預計時間</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="flex items-center gap-2">
              <td className="w-20 shrink-0 truncate text-ink-2 sm:w-24">{r.accountLabel}</td>
              <td className="min-w-0 flex-1 truncate text-ink">{r.productName ?? "（草稿）"}</td>
              <td className="hidden shrink-0 text-xs text-ink-3 sm:block sm:max-w-[12rem] sm:truncate">{r.reason}</td>
              <td className="w-24 shrink-0 text-right text-xs tabular-nums text-ink-2 sm:w-28">{fmt(r.etaIso)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// 自動駕駛心跳：依上次排程執行時間判斷是否運轉中（demo 模式不顯示）。
function Autopilot({ lastCronAt, demo }: { lastCronAt?: string | null; demo: boolean }) {
  if (demo) return null;
  if (!lastCronAt) {
    return (
      <div className="rounded-2xl border border-border bg-surface-2 p-3 text-sm text-ink-2">
        ⏸️ 自動排程還沒開 — 開了之後系統才會<b>自動抓文、自動發文</b>。開啟方式：到部署平台
        Zeabur 新增一個「定時任務（Cron Job）」，每 15 分鐘呼叫一次網址 <code>/api/cron/all</code>。
      </div>
    );
  }
  const mins = Math.round((Date.now() - new Date(lastCronAt).getTime()) / 60000);
  const stale = mins > 30;
  const ago = mins < 1 ? "剛剛" : mins < 60 ? `${mins} 分鐘前` : `${Math.round(mins / 60)} 小時前`;
  return (
    <div
      className={`flex items-center gap-2 rounded-2xl border p-3 text-sm ${
        stale ? "border-amber-200 bg-amber-50 text-amber-700" : "border-green-200 bg-green-50 text-green-700"
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${stale ? "bg-amber-500" : "animate-pulse bg-green-500"}`} />
      {stale ? `⚠️ 排程似乎停了（上次執行 ${ago}）` : `🚀 自動駕駛運轉中 — 上次執行 ${ago}`}
    </div>
  );
}

// 手動「立即跑一輪佇列」：不想等下次排程時，按一下馬上發（仍守防封節奏）。owner 限定。
function RunQueueButton({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/publish/run-now", { method: "POST" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      const r = json.result;
      if (r.lockBusy) {
        setMsg("另一輪發文正在執行，稍後再試");
      } else {
        setMsg(`已發 ${r.published.length}、略過 ${r.skipped.length}、失敗 ${r.failed.length}`);
      }
      onDone();
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex items-center gap-2" role="status" aria-live="polite">
      <button
        onClick={run}
        disabled={busy}
        aria-busy={busy}
        className="rounded-xl border border-brand/40 bg-orange-50 px-3 py-1.5 text-sm text-brand hover:bg-orange-100 disabled:opacity-50"
      >
        {busy ? "發送中…" : "⚡ 立即發送排隊貼文"}
      </button>
      {msg && <span className="text-xs text-ink-2">{msg}</span>}
    </div>
  );
}

// 全域發文急停開關（owner 限定）：暫停時所有自動發文整批跳過（cron + 立即跑一輪），
// 不影響草稿頁單篇「核准並發布」（那是操作者明確意圖）。緊急防封用。
function PauseToggle({ paused, onDone }: { paused: boolean; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function toggle() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/publish/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: !paused })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      onDone();
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex items-center gap-2" role="status" aria-live="polite">
      <button
        onClick={toggle}
        disabled={busy}
        aria-busy={busy}
        className={`rounded-xl border px-3 py-1.5 text-sm disabled:opacity-50 ${
          paused
            ? "border-green-400 bg-green-50 text-green-700 hover:bg-green-100"
            : "border-red-300 bg-red-50 text-red-600 hover:bg-red-100"
        }`}
      >
        {busy ? "處理中…" : paused ? "▶️ 恢復自動發文" : "⏸️ 暫停自動發文"}
      </button>
      {msg && <span className="text-xs text-ink-2">{msg}</span>}
    </div>
  );
}

// 30s：/api/dashboard 每次跑 15 條 count 查詢，多開分頁會放大 DB 負載；多數欄位變動不頻繁。
const REFRESH_MS = 30000;

function Chip({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ${
        on ? "bg-green-50 text-green-700" : "bg-surface-2 text-ink-3"
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${on ? "bg-green-500" : "bg-neutral-300"}`} />
      {label}
    </span>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium text-ink-2">{label}</div>
      <div className={`stat-num mt-1.5 text-3xl ${accent ?? "text-ink"}`}>{value}</div>
    </div>
  );
}

function Bar({ used, limit }: { used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const color = pct > 80 ? "bg-red-500" : pct > 50 ? "bg-amber-500" : "bg-green-500";
  return (
    <div className="h-2 w-full overflow-hidden rounded bg-surface-2">
      <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function LiveDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);

  const load = useCallback(async () => {
    if (loadingRef.current) return; // 同時間只允許一個請求，避免重複並行
    loadingRef.current = true;
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "讀取失敗");
      setData(json);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  if (!data && !err) return <div className="text-sm text-ink-3">載入中…</div>;
  if (err)
    return (
      <div className="card flex flex-wrap items-center gap-3 border-danger/30 bg-danger/5 p-4 text-sm text-danger">
        <span>⚠️ 暫時讀不到儀表板資料（{err}）。</span>
        <button onClick={load} className="btn btn-outline btn-sm">重新整理</button>
      </div>
    );
  if (!data) return null;

  const d = data.stats;
  const issues = d.accountIssues ?? { error: 0, paused: 0, tokenExpiring: 0 };
  const tokenExpiring = issues.tokenExpiring ?? 0;
  const invalidMaterials = d.invalidMaterials ?? 0;
  const needsVerification = d.needsVerification ?? 0;
  const needsAttention =
    issues.error > 0 || d.drafts.failed > 0 || issues.paused > 0 || tokenExpiring > 0 || invalidMaterials > 0 || needsVerification > 0;
  return (
    <div className="space-y-6">
      <Autopilot lastCronAt={data.lastCronAt} demo={data.demo} />
      {data.publishPaused && (
        <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <span className="h-2 w-2 rounded-full bg-red-500" />
          ⏸️ 自動發文已暫停 — 自動排程與「立即發送排隊貼文」都會整批跳過。草稿頁單篇「核准並發布」仍可手動發。
        </div>
      )}
      {data.isOwner && !data.demo && (
        <div className="flex flex-wrap items-center gap-3">
          <RunQueueButton onDone={load} />
          <PauseToggle paused={Boolean(data.publishPaused)} onDone={load} />
        </div>
      )}
      <AccountsHealth rows={data.accountsHealth} />
      <PublishPlan rows={data.publishPlan} />
      {needsAttention && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <span className="font-semibold">⚠️ 需要注意</span>
          <span className="ml-2 inline-flex flex-wrap gap-x-4 gap-y-1">
            {issues.error > 0 && (
              <Link href="/accounts" className="underline hover:opacity-80">
                {issues.error} 個帳號 token 異常（展期失敗）
              </Link>
            )}
            {issues.paused > 0 && <span>{issues.paused} 個帳號已暫停</span>}
            {tokenExpiring > 0 && (
              <Link href="/accounts" className="underline hover:opacity-80">
                {tokenExpiring} 個帳號 token 即將到期/已過期
              </Link>
            )}
            {invalidMaterials > 0 && (
              <Link href="/materials" className="underline hover:opacity-80">
                {invalidMaterials} 個素材連結失效（可重產）
              </Link>
            )}
            {d.drafts.failed > 0 && (
              <Link href="/drafts" className="underline hover:opacity-80">
                {d.drafts.failed} 則草稿發布失敗（可重試）
              </Link>
            )}
            {needsVerification > 0 && (
              <Link href="/drafts" className="font-medium text-orange-700 underline hover:opacity-80">
                {needsVerification} 則發布待確認（可能已發出，請盡快確認）
              </Link>
            )}
          </span>
        </div>
      )}
      <div className="card flex flex-wrap items-center gap-2 p-4">
        <span className="mr-1 text-xs font-medium text-ink-2">服務連線</span>
        <Chip label="資料庫" on={Boolean(data.services.supabase)} />
        <Chip label="AI 文案" on={Boolean(data.services.gemini)} />
        <Chip label="自動抓文" on={Boolean(data.services.apify)} />
        <Chip label="蝦皮分潤" on={Boolean(data.services.shopee)} />
        <Chip label="圖片影片空間" on={Boolean(data.services.cloudinary)} />
        <span className="ml-auto flex items-center gap-2 text-xs text-ink-3">
          {loading && <span className="h-2 w-2 animate-pulse rounded-full bg-green-400" />}
          更新於 {new Date(data.at).toLocaleTimeString("zh-TW", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit" })}
          <button onClick={load} className="rounded-full border border-border px-2.5 py-1 hover:bg-surface-2">
            重新整理
          </button>
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Stat label="Threads 帳號" value={d.threadsAccounts} />
        <Stat label="監看來源" value={d.sources} />
        <Stat label="素材庫" value={d.materials} />
        <Stat label="待審草稿" value={d.drafts.draft} accent="text-blue-600" />
        <Stat label="近 24h 已發" value={d.publishedLast24h} accent="text-green-600" />
      </div>

      <div className="card p-5">
        <h2 className="mb-3 font-semibold">草稿漏斗</h2>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {[
            ["待審", d.drafts.draft, "bg-blue-50 text-blue-700"],
            ["已核准", d.drafts.approved, "bg-amber-50 text-amber-700"],
            ["已發布", d.drafts.published, "bg-green-50 text-green-700"],
            ["失敗", d.drafts.failed, "bg-red-50 text-red-600"]
          ].map(([label, v, cls], i) => (
            <span key={label as string} className="flex items-center gap-2">
              <span className={`rounded-xl px-3 py-1.5 ${cls}`}>
                {label as string} <b>{v as number}</b>
              </span>
              {i < 3 && <span className="text-ink-3">→</span>}
            </span>
          ))}
        </div>
        {d.replies && (d.replies.pending > 0 || d.replies.failed > 0) && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3 text-sm">
            <span className="text-ink-2">延遲留言：</span>
            {d.replies.pending > 0 && (
              <span className="rounded-xl bg-amber-50 px-3 py-1.5 text-amber-700">待補 <b>{d.replies.pending}</b></span>
            )}
            {d.replies.failed > 0 && (
              <span className="rounded-xl bg-red-50 px-3 py-1.5 text-red-600">補發失敗 <b>{d.replies.failed}</b></span>
            )}
          </div>
        )}
      </div>

      {data.isOwner && data.threadsQuota.length > 0 && (
        <div className="card p-5">
          <h2 className="mb-3 font-semibold">Threads 今日發文額度（即時）</h2>
          <div className="space-y-3">
            {data.threadsQuota.map((q) => (
              <div key={q.label}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{q.label}</span>
                  <span className="text-ink-2">
                    {q.used} / {q.limit}
                  </span>
                </div>
                <Bar used={q.used} limit={q.limit} />
              </div>
            ))}
          </div>
        </div>
      )}

      {data.isOwner && data.cloudinary && (
        <div className="card p-5">
          <h2 className="mb-3 font-semibold">Cloudinary 用量（即時）</h2>
          <div className="mb-1 flex justify-between text-sm">
            <span>Credits</span>
            <span className="text-ink-2">
              {data.cloudinary.creditsUsed.toFixed(2)} / {data.cloudinary.creditsLimit}
            </span>
          </div>
          <Bar used={data.cloudinary.creditsUsed} limit={data.cloudinary.creditsLimit} />
          <div className="mt-2 text-xs text-ink-3">
            儲存 {(data.cloudinary.storageBytes / 1e9).toFixed(2)} GB · {data.cloudinary.resources} 個資源
          </div>
        </div>
      )}
    </div>
  );
}
