"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { summarizePipelineRun } from "@/services/pipeline/summary";

// 一次抓取的單一來源結果（對應後端 PipelineResult；只取面板要顯示的欄位）。
interface SourceResult {
  sourceUsername?: string;
  keyword?: string;
  scanned?: number;
  created?: number;
  pending?: number;
  skipped?: number;
  reusedMaterial?: number;
  notes?: string[];
  error?: string;
}

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// 手動觸發抓取：跑自己所有啟用中的來源（用自己的 Apify 金鑰），把貼文換成分潤連結後產生「素材」入庫。
// 跑完把整理過的回傳資訊（每來源掃描/新增/待審/略過/重用＋逐筆紀錄）顯示在頁面，方便排查抓不到的原因。
export default function RunPipelineButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SourceResult[] | null>(null);
  const [force, setForce] = useState(false);

  async function run() {
    setBusy(true);
    setMsg("抓取中…（會邊抓邊把新素材帶進下方待審區）");
    setError(null);
    setResults(null);
    // 抓取是同步長流程，但每篇處理完就即時寫進 DB。跑的同時定期刷新，新素材會「邊抓邊出現」在待審區，
    // 不用等整批跑完（≈ 實時更新）。完成後於 finally 清掉計時器並做最後一次刷新。
    const tick = setInterval(() => router.refresh(), 4000);
    try {
      const res = await fetch("/api/pipeline/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force })
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(typeof json?.error === "string" && json.error ? json.error : `抓取失敗（HTTP ${res.status}）`);
      }
      const rows: SourceResult[] = Array.isArray(json?.results) ? json.results : [];
      setResults(rows);
      setMsg(summarizePipelineRun(rows).message);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setMsg(null);
    } finally {
      clearInterval(tick);
      setBusy(false);
      router.refresh();
    }
  }

  const totalScanned = results?.reduce((n, r) => n + num(r.scanned), 0) ?? 0;
  const noneScanned = results !== null && results.length > 0 && totalScanned === 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={run} disabled={busy} className="btn btn-brand">
          {busy ? "抓取中…" : "立即抓取"}
        </button>
        <label className="flex items-center gap-1 text-sm text-ink-2" title="忽略「已抓過」與「已有素材」，把來源貼文整批重抓一次（改設定／換 actor 後用）">
          <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} disabled={busy} />
          強制重抓（忽略已抓過）
        </label>
        {msg && <span className="text-sm text-ink-2" role="status" aria-live="polite">{busy ? msg : `✅ ${msg}`}</span>}
        {error && <span className="text-sm text-rose-600" role="alert">❌ {error}</span>}
      </div>

      {noneScanned && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          這次一篇都沒抓到。可能是這個排序或時間區間剛好沒有符合的貼文，或關鍵字比較冷門。
          可以把排序改成「熱門」、放寬或清空日期區間、或多加幾個關鍵字再試一次。同樣的關鍵字有時也會因當下狀況回 0，稍後再抓常常就有了。
        </div>
      )}

      {results && results.length > 0 && (
        <div className="space-y-2">
          {results.map((r, i) => {
            const scanned = num(r.scanned);
            const created = num(r.created);
            const pending = num(r.pending);
            const skipped = num(r.skipped);
            const reused = num(r.reusedMaterial);
            const label = r.keyword || r.sourceUsername || "來源";
            return (
              <div key={i} className="rounded-xl border bg-surface-2 p-3 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink">{label}</span>
                  {r.keyword && r.sourceUsername && r.sourceUsername !== r.keyword && (
                    <span className="text-ink-3">在 @{r.sourceUsername} 內</span>
                  )}
                  {r.error && <span className="rounded bg-rose-100 px-1.5 py-0.5 text-rose-700">失敗</span>}
                </div>
                {r.error ? (
                  <p className="mt-1 text-rose-600">{r.error}</p>
                ) : (
                  <p className="mt-1 text-ink-2">
                    掃描 {scanned} 篇 → 新增素材 {created} 則（待審 {pending}）、略過 {skipped}
                    {reused ? `、重用 ${reused}` : ""}
                  </p>
                )}
                {r.notes && r.notes.length > 0 && (
                  <details className="mt-1.5">
                    <summary className="cursor-pointer text-ink-3 hover:text-ink">逐筆紀錄（{r.notes.length} 筆）</summary>
                    <ul className="mt-1 space-y-0.5 pl-4 text-ink-3 [overflow-wrap:anywhere]">
                      {r.notes.map((n, j) => (
                        <li key={j} className="list-disc">{n}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
