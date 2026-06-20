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
  };
  threadsQuota: { label: string; used: number; limit: number }[];
  cloudinary: { creditsUsed: number; creditsLimit: number; storageBytes: number; resources: number } | null;
  lastCronAt?: string | null;
  binds?: { apify: boolean; gemini: boolean; shopee: boolean } | null;
  publishPlan?: { id: string; productName: string | null; accountLabel: string; etaIso: string | null; reason: string }[];
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
    <div className="rounded-lg border bg-white p-5">
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
              <td className="w-24 shrink-0 truncate text-neutral-500">{r.accountLabel}</td>
              <td className="min-w-0 flex-1 truncate text-neutral-800">{r.productName ?? "（草稿）"}</td>
              <td className="shrink-0 text-xs text-neutral-400">{r.reason}</td>
              <td className="w-28 shrink-0 text-right text-xs tabular-nums text-neutral-600">{fmt(r.etaIso)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// 未綁金鑰提示：自綁或 env 任一有就算 OK；缺的列出來提醒去帳號管理綁。
function MissingBinds({ binds }: { binds?: { apify: boolean; gemini: boolean; shopee: boolean } | null }) {
  if (!binds) return null;
  const missing = [
    !binds.apify && "Apify（爬蟲）",
    !binds.gemini && "Gemini（AI 文案）",
    !binds.shopee && "Shopee（分潤）"
  ].filter(Boolean) as string[];
  if (missing.length === 0) return null;
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
      🔑 尚未設定：{missing.join("、")}。到{" "}
      <Link href="/accounts" className="underline hover:opacity-80">
        帳號管理
      </Link>{" "}
      綁定後爬蟲／AI 才能運作。
    </div>
  );
}

// 自動駕駛心跳：依上次排程執行時間判斷是否運轉中（demo 模式不顯示）。
function Autopilot({ lastCronAt, demo }: { lastCronAt?: string | null; demo: boolean }) {
  if (demo) return null;
  if (!lastCronAt) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-500">
        🅿️ 自動駕駛尚未啟動 — 請到 Zeabur 設一條 Cron 打 <code>/api/cron/all</code>（每 15 分）。
      </div>
    );
  }
  const mins = Math.round((Date.now() - new Date(lastCronAt).getTime()) / 60000);
  const stale = mins > 30;
  const ago = mins < 1 ? "剛剛" : mins < 60 ? `${mins} 分鐘前` : `${Math.round(mins / 60)} 小時前`;
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${
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
        className="rounded-md border border-shopee/40 bg-orange-50 px-3 py-1.5 text-sm text-shopee hover:bg-orange-100 disabled:opacity-50"
      >
        {busy ? "發送中…" : "⚡ 立即跑一輪佇列"}
      </button>
      {msg && <span className="text-xs text-neutral-500">{msg}</span>}
    </div>
  );
}

const REFRESH_MS = 20000;

function Chip({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ${
        on ? "bg-green-50 text-green-700" : "bg-neutral-100 text-neutral-400"
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${on ? "bg-green-500" : "bg-neutral-300"}`} />
      {label}
    </span>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="text-sm text-neutral-500">{label}</div>
      <div className={`mt-1 text-3xl font-bold ${accent ?? ""}`}>{value}</div>
    </div>
  );
}

function Bar({ used, limit }: { used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const color = pct > 80 ? "bg-red-500" : pct > 50 ? "bg-amber-500" : "bg-green-500";
  return (
    <div className="h-2 w-full overflow-hidden rounded bg-neutral-100">
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

  if (!data && !err) return <div className="text-sm text-neutral-400">載入中…</div>;
  if (err) return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">⚠️ {err}</div>;
  if (!data) return null;

  const d = data.stats;
  const issues = d.accountIssues ?? { error: 0, paused: 0, tokenExpiring: 0 };
  const tokenExpiring = issues.tokenExpiring ?? 0;
  const invalidMaterials = d.invalidMaterials ?? 0;
  const needsAttention = issues.error > 0 || d.drafts.failed > 0 || issues.paused > 0 || tokenExpiring > 0 || invalidMaterials > 0;
  // 核心流程未走完（沒帳號、沒素材、或未曾發布）時，顯示上手引導，直到三步都完成才隱藏
  const setupIncomplete = d.threadsAccounts === 0 || d.materials === 0 || d.drafts.published === 0;
  const steps = [
    { done: d.threadsAccounts > 0, label: "連結 Threads 發文帳號", href: "/accounts", cta: "去連結" },
    { done: d.materials > 0, label: "貼蝦皮連結，產生第一則文案", href: "/compose", cta: "去發文" },
    { done: d.drafts.published > 0, label: "審核並發布（或排程）", href: "/drafts", cta: "看佇列" }
  ];
  return (
    <div className="space-y-6">
      <Autopilot lastCronAt={data.lastCronAt} demo={data.demo} />
      {data.isOwner && !data.demo && <RunQueueButton onDone={load} />}
      <MissingBinds binds={data.binds} />
      <PublishPlan rows={data.publishPlan} />
      {setupIncomplete && (
        <div className="rounded-lg border border-shopee/30 bg-orange-50 p-5">
          <h2 className="mb-3 font-semibold text-neutral-800">🚀 開始使用（3 步驟）</h2>
          <ol className="space-y-2">
            {steps.map((s, i) => (
              <li key={s.href} className="flex items-center gap-3 text-sm">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
                    s.done ? "bg-green-500 text-white" : "bg-white text-neutral-500 ring-1 ring-neutral-300"
                  }`}
                >
                  {s.done ? "✓" : i + 1}
                </span>
                <span className={s.done ? "text-neutral-400 line-through" : "text-neutral-700"}>{s.label}</span>
                {!s.done && (
                  <Link href={s.href} className="ml-auto rounded-md bg-shopee px-3 py-1 text-xs font-medium text-white hover:opacity-90">
                    {s.cta}
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
      {needsAttention && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
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
          </span>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Chip label="Supabase" on={Boolean(data.services.supabase)} />
        <Chip label={`AI (${data.services.ai_provider})`} on={Boolean(data.services.gemini)} />
        <Chip label="Apify 爬蟲" on={Boolean(data.services.apify)} />
        <Chip label="Shopee 分潤" on={Boolean(data.services.shopee)} />
        <Chip label="Cloudinary" on={Boolean(data.services.cloudinary)} />
        <span className="ml-auto flex items-center gap-2 text-xs text-neutral-400">
          {loading && <span className="h-2 w-2 animate-pulse rounded-full bg-green-400" />}
          更新於 {new Date(data.at).toLocaleTimeString("zh-TW")}
          <button onClick={load} className="rounded border px-2 py-0.5 hover:bg-neutral-50">
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

      <div className="rounded-lg border bg-white p-5">
        <h2 className="mb-3 font-semibold">草稿漏斗</h2>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {[
            ["待審", d.drafts.draft, "bg-blue-50 text-blue-700"],
            ["已核准", d.drafts.approved, "bg-amber-50 text-amber-700"],
            ["已發布", d.drafts.published, "bg-green-50 text-green-700"],
            ["失敗", d.drafts.failed, "bg-red-50 text-red-600"]
          ].map(([label, v, cls], i) => (
            <span key={label as string} className="flex items-center gap-2">
              <span className={`rounded-md px-3 py-1.5 ${cls}`}>
                {label as string} <b>{v as number}</b>
              </span>
              {i < 3 && <span className="text-neutral-300">→</span>}
            </span>
          ))}
        </div>
        {d.replies && (d.replies.pending > 0 || d.replies.failed > 0) && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3 text-sm">
            <span className="text-neutral-500">延遲留言：</span>
            {d.replies.pending > 0 && (
              <span className="rounded-md bg-amber-50 px-3 py-1.5 text-amber-700">待補 <b>{d.replies.pending}</b></span>
            )}
            {d.replies.failed > 0 && (
              <span className="rounded-md bg-red-50 px-3 py-1.5 text-red-600">補發失敗 <b>{d.replies.failed}</b></span>
            )}
          </div>
        )}
      </div>

      {data.isOwner && data.threadsQuota.length > 0 && (
        <div className="rounded-lg border bg-white p-5">
          <h2 className="mb-3 font-semibold">Threads 今日發文額度（即時）</h2>
          <div className="space-y-3">
            {data.threadsQuota.map((q) => (
              <div key={q.label}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{q.label}</span>
                  <span className="text-neutral-500">
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
        <div className="rounded-lg border bg-white p-5">
          <h2 className="mb-3 font-semibold">Cloudinary 用量（即時）</h2>
          <div className="mb-1 flex justify-between text-sm">
            <span>Credits</span>
            <span className="text-neutral-500">
              {data.cloudinary.creditsUsed.toFixed(2)} / {data.cloudinary.creditsLimit}
            </span>
          </div>
          <Bar used={data.cloudinary.creditsUsed} limit={data.cloudinary.creditsLimit} />
          <div className="mt-2 text-xs text-neutral-400">
            儲存 {(data.cloudinary.storageBytes / 1e9).toFixed(2)} GB · {data.cloudinary.resources} 個資源
          </div>
        </div>
      )}
    </div>
  );
}
