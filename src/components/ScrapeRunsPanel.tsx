"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Run {
  id: string;
  apify_run_id: string;
  status: "running" | "ingesting" | "done" | "failed";
  keyword: string | null;
  item_count: number | null;
  created_count: number | null;
  error: string | null;
  created_at: string;
}

const STATUS: Record<Run["status"], { label: string; cls: string }> = {
  running: { label: "抓取中", cls: "bg-blue-50 text-blue-700" },
  ingesting: { label: "入庫中", cls: "bg-purple-50 text-purple-700" },
  done: { label: "完成", cls: "bg-green-50 text-green-700" },
  failed: { label: "失敗", cls: "bg-red-50 text-red-600" }
};

// 背景（非同步）抓取＋即時進度：啟動後立刻回，背景 cron／本頁輪詢推進，完成才入庫。可長跑、關頁也跑完。
export default function ScrapeRunsPanel() {
  const router = useRouter();
  const [runs, setRuns] = useState<Run[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [logFor, setLogFor] = useState<string | null>(null);
  const [logText, setLogText] = useState("");

  const hasActive = runs.some((r) => r.status === "running" || r.status === "ingesting");

  const refresh = useCallback(async (logRunId?: string | null) => {
    const qs = logRunId ? `?log=1&runId=${encodeURIComponent(logRunId)}` : "";
    const res = await fetch(`/api/scrape/status${qs}`, { cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (json?.ok) {
      setRuns(json.runs ?? []);
      if (logRunId && typeof json.log === "string") setLogText(json.log);
    }
  }, []);

  // 掛載先抓一次（重開頁也看得到目前進度）。
  useEffect(() => {
    refresh();
  }, [refresh]);

  // 有 run 還在跑就每 3.5s 輪詢（同時推進伺服器端、抓 log）；全部完成就停。
  useEffect(() => {
    if (!hasActive) return;
    const t = setInterval(() => refresh(logFor), 3500);
    return () => clearInterval(t);
  }, [hasActive, refresh, logFor]);

  // 由「有 active」變「無 active」＝這批跑完了 → 刷新頁面帶出新待審素材數。
  const prevActive = useRef(hasActive);
  useEffect(() => {
    if (prevActive.current && !hasActive) router.refresh();
    prevActive.current = hasActive;
  }, [hasActive, router]);

  async function start(force = false) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/scrape/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ force }) });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setRuns(json.runs ?? []);
      setMsg((json.runs ?? []).length ? `已啟動 ${json.runs.length} 個背景抓取` : "沒有啟用的關鍵字來源");
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  function toggleLog(run: Run) {
    if (logFor === run.id) {
      setLogFor(null);
      setLogText("");
    } else {
      setLogFor(run.id);
      setLogText("載入中…");
      refresh(run.id);
    }
  }

  return (
    <div className="rounded-2xl border bg-surface p-4">
      <div className="mb-1 font-medium">立即抓取（背景・即時進度）</div>
      <p className="mb-2 text-xs text-ink-3">
        跑你自己的 Apify 金鑰抓上面所有關鍵字（費用算你帳上）。啟動後立刻回、背景繼續跑，<b>關頁也會跑完</b>（不受 5 分鐘上限）。
        下方即時顯示每個來源的進度，完成後素材自動進待審。
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => start(false)} disabled={busy || hasActive} className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {busy ? "啟動中…" : hasActive ? "抓取進行中…" : "開始背景抓取"}
        </button>
        <button onClick={() => start(true)} disabled={busy || hasActive} title="忽略「已抓過」與「已有有效素材」，強制重抓" className="rounded-xl border px-3 py-2 text-sm hover:bg-surface-2 disabled:opacity-50">
          強制重抓
        </button>
        <button onClick={() => refresh(logFor)} disabled={busy} className="rounded-xl border px-3 py-2 text-sm hover:bg-surface-2 disabled:opacity-50">
          重新整理
        </button>
        {msg && <span className="min-w-0 break-words text-sm text-ink-2">{msg}</span>}
      </div>

      {runs.length > 0 && (
        <ul className="mt-3 space-y-2">
          {runs.map((r) => (
            <li key={r.id} className="rounded-xl border bg-surface-2/40 p-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
                <span className="min-w-0 break-words font-medium text-ink">{r.keyword || "（監看帳號）"}</span>
                {r.status === "done" && (
                  <span className="text-xs text-ink-2">抓到 {r.item_count ?? 0} 篇、新增待審 {r.created_count ?? 0}</span>
                )}
                {r.apify_run_id && (
                  <button type="button" onClick={() => toggleLog(r)} className="ml-auto text-xs text-brand hover:underline">
                    {logFor === r.id ? "收合 log" : "查看 log"}
                  </button>
                )}
              </div>
              {r.error && <p className="mt-1 break-words text-xs text-red-600">⚠️ {r.error}</p>}
              {logFor === r.id && (
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-ink/90 p-2 text-[11px] leading-tight text-bg">{logText || "（無 log）"}</pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
