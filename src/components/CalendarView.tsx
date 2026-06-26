"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export interface CalItem {
  id: string;
  iso: string;
  title: string;
  status: string;
  accountLabel: string | null;
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const TZ = "Asia/Taipei";
const pad2 = (n: number) => String(n).padStart(2, "0");

// 把某個時間點（instant）在 Asia/Taipei 的日期算成 YYYY-MM-DD（en-CA 即此格式）。
// 一律固定台北時區，避免 SSR/瀏覽器時區不同造成日分桶/今日高亮不一致（hydration mismatch）。
const ymdFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
function dayKey(d: Date): string {
  return ymdFmt.format(d);
}

// 狀態 → 色票（與草稿頁語意一致）。
function statusClass(status: string): string {
  if (status === "published") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "failed" || status === "needs_verification") return "bg-red-50 text-red-600 border-red-200";
  return "bg-brand/10 text-brand border-brand/20"; // approved / scheduled / 其他待發
}

// 內容行事曆月檢視：唯讀，依排程/發布時間把貼文落到日格。
export default function CalendarView({ items }: { items: CalItem[] }) {
  // 今天（台北）作為起點與高亮基準；以 dayKey 拆出年月，避免瀏覽器時區造成跨日偏移。
  const todayKey = dayKey(new Date());
  const [ty, tm] = todayKey.split("-").map(Number); // ty=年, tm=月(1-based)
  const [cursor, setCursor] = useState({ year: ty, month: tm - 1 });

  // 依本地日 key 分桶，桶內依時間排序。
  const byDay = useMemo(() => {
    const m = new Map<string, CalItem[]>();
    for (const it of items) {
      const d = new Date(it.iso);
      if (Number.isNaN(d.getTime())) continue;
      const k = dayKey(d);
      const arr = m.get(k);
      if (arr) arr.push(it);
      else m.set(k, [it]);
    }
    // ISO 8601 字串可直接字典序排序（等同時序），免在比較器內重複建立 Date。
    for (const arr of m.values()) arr.sort((a, b) => a.iso.localeCompare(b.iso));
    return m;
  }, [items]);

  // 月格：以日數字建構（純日曆，不經時區轉換），補前置空白對齊週日、補滿整週。
  const cells = useMemo(() => {
    const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
    const lead = new Date(cursor.year, cursor.month, 1).getDay(); // 0=週日
    const out: (number | null)[] = [];
    for (let i = 0; i < lead; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(d);
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [cursor]);

  // 月份前綴（台北）：用來算「本月幾則」與日格 key 對齊。
  const monthPrefix = `${cursor.year}-${pad2(cursor.month + 1)}`;
  const monthCount = useMemo(
    () => items.filter((it) => dayKey(new Date(it.iso)).startsWith(monthPrefix)).length,
    [items, monthPrefix]
  );

  const shift = (delta: number) => {
    const m = cursor.month + delta;
    setCursor({ year: cursor.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 });
  };

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button onClick={() => shift(-1)} className="btn btn-outline btn-sm" aria-label="上個月">←</button>
          <span className="min-w-[7rem] text-center text-sm font-semibold tabular-nums">
            {cursor.year} 年 {cursor.month + 1} 月
          </span>
          <button onClick={() => shift(1)} className="btn btn-outline btn-sm" aria-label="下個月">→</button>
          <button
            onClick={() => setCursor({ year: ty, month: tm - 1 })}
            className="btn btn-ghost btn-sm"
          >
            今天
          </button>
        </div>
        <span className="text-xs text-ink-3">本月 {monthCount} 則</span>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-border bg-border text-center">
        {WEEKDAYS.map((w) => (
          <div key={w} className="bg-surface-2 py-1.5 text-xs font-medium text-ink-3">{w}</div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <div key={`e-${i}`} className="min-h-[5.5rem] bg-surface/40" />;
          const k = `${monthPrefix}-${pad2(day)}`;
          const dayItems = byDay.get(k) ?? [];
          const isToday = k === todayKey;
          return (
            <div key={k} className="min-h-[5.5rem] bg-surface p-1 text-left align-top">
              <div className={`mb-1 text-xs tabular-nums ${isToday ? "font-bold text-brand" : "text-ink-3"}`}>
                {isToday ? `● ${day}` : day}
              </div>
              <div className="flex flex-col gap-1">
                {dayItems.slice(0, 3).map((it) => {
                  const t = new Date(it.iso).toLocaleTimeString("zh-TW", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
                  return (
                    <Link
                      key={it.id}
                      href="/drafts"
                      title={`${t}${it.accountLabel ? ` · @${it.accountLabel}` : ""}｜${it.title}`}
                      className={`block truncate rounded border px-1 py-0.5 text-[11px] leading-tight ${statusClass(it.status)}`}
                    >
                      <span className="tabular-nums">{t}</span> {it.title}
                    </Link>
                  );
                })}
                {dayItems.length > 3 && (
                  <Link href="/drafts" className="px-1 text-[11px] text-ink-3 hover:underline">
                    +{dayItems.length - 3} 則
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-ink-3">
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm border border-brand/20 bg-brand/10" />已排程/待發</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm border border-emerald-200 bg-emerald-50" />已發布</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm border border-red-200 bg-red-50" />失敗/待確認</span>
      </div>
    </div>
  );
}
