"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { monthsBetween, monthBounds, MAX_BATCH_MONTHS } from "@/lib/month-range";

// 批次逐月抓取：選起訖月份，系統逐月各跑一次 Apify（每月帶該月日期區間），結果都進待審素材。
// 注意：日期只有舊版 igview 抓取器會吃；新版 automation-lab 會忽略日期（逐月會抓到相同近期貼文）。
// 每月一個 Apify run（費用算你帳上），上限 MAX_BATCH_MONTHS 個月。逐月序列跑，請保持此頁開著。
export default function BatchMonthScrape() {
  const router = useRouter();
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const months = start && end ? monthsBetween(start, end, MAX_BATCH_MONTHS) : [];
  const truncated = months.length === MAX_BATCH_MONTHS && months[months.length - 1] !== end;
  // 只要起訖都選了且非忙碌就可按；無效區間（起晚於迄）交給 run() 內驗證並顯示提示（按鈕禁用會讓使用者不知原因）。
  const canRun = !!start && !!end && !busy;

  // 批次序列執行可能跑數分鐘：執行中攔截關頁/重整，避免中途中斷。
  useEffect(() => {
    if (!busy) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [busy]);

  async function run() {
    if (months.length === 0) {
      setMsg("請選擇有效的起訖月份（起不可晚於迄）");
      return;
    }
    setBusy(true);
    setMsg(null);
    let done = 0;
    let totalCreated = 0;
    try {
      for (let i = 0; i < months.length; i++) {
        const ym = months[i];
        const b = monthBounds(ym)!;
        setProgress(`第 ${i + 1}/${months.length} 月（${ym}）抓取中…`);
        const res = await fetch("/api/pipeline/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // 逐月帶該月日期區間；force 重抓（不同月份本來就是不同貼文，避免被「已抓過」去重擋掉）。
          body: JSON.stringify({ after: b.after, before: b.before, force: true })
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) throw new Error(`${ym}：${json?.error || `HTTP ${res.status}`}（已完成 ${done} 個月）`);
        done++;
        for (const r of json.results ?? []) totalCreated += r.created ?? 0;
      }
      setMsg(`✅ 批次完成：${done} 個月、新增 ${totalCreated} 筆待審素材`);
      setProgress(null);
      router.refresh();
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
      setProgress(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border bg-surface p-4">
      <div className="mb-1 font-medium">批次逐月抓取</div>
      <p className="mb-2 text-xs text-ink-3">
        選一段月份，系統逐月各跑一次（每月帶該月日期區間），結果都進待審素材。<b>每月一個 Apify run（費用算你帳上）</b>，
        一次最多 {MAX_BATCH_MONTHS} 個月。日期只有<b>舊版 igview 抓取器</b>會生效，請先到帳號管理切換。
      </p>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <input type="month" value={start} onChange={(e) => setStart(e.target.value)} aria-label="起始月份" className="rounded-xl border px-3 py-1.5" />
        <span className="text-ink-3">到</span>
        <input type="month" value={end} onChange={(e) => setEnd(e.target.value)} aria-label="結束月份" className="rounded-xl border px-3 py-1.5" />
        <button onClick={run} disabled={!canRun} className="rounded-xl bg-brand px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          {busy ? "批次抓取中…" : months.length > 0 ? `開始批次（${months.length} 個月）` : "開始批次"}
        </button>
      </div>
      {truncated && <p className="mt-1 text-xs text-amber-600">⚠️ 區間超過 {MAX_BATCH_MONTHS} 個月，只會抓前 {MAX_BATCH_MONTHS} 個月（{months[0]}～{months[months.length - 1]}）。</p>}
      {progress && <p className="mt-2 text-sm text-ink-2" role="status" aria-live="polite">{progress}</p>}
      {msg && <p className="mt-2 text-sm text-ink-2" role="status" aria-live="polite">{msg}</p>}
    </div>
  );
}
