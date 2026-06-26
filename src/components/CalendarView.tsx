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

// 本地日期 key（YYYY-MM-DD，Asia/Taipei 由瀏覽器本地時區呈現）。
function dayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 狀態 → 色票（與草稿頁語意一致）。
function statusClass(status: string): string {
  if (status === "published") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "failed" || status === "needs_verification") return "bg-red-50 text-red-600 border-red-200";
  return "bg-brand/10 text-brand border-brand/20"; // approved / scheduled / 其他待發
}

// 內容行事曆月檢視：唯讀，依排程/發布時間把貼文落到日格。
export default function CalendarView({ items }: { items: CalItem[] }) {
  // 以「本月」為起點（用本地時間建構，避免 UTC 位移到鄰月）。
  const today = new Date();
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() });

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
    for (const arr of m.values()) arr.sort((a, b) => +new Date(a.iso) - +new Date(b.iso));
    return m;
  }, [items]);

  // 月格：補前置空白到週日對齊，總是補滿整週。
  const cells = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1);
    const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
    const lead = first.getDay(); // 0=週日
    const out: (Date | null)[] = [];
    for (let i = 0; i < lead; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(new Date(cursor.year, cursor.month, d));
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [cursor]);

  const todayKey = dayKey(today);
  const monthCount = items.filter((it) => {
    const d = new Date(it.iso);
    return d.getFullYear() === cursor.year && d.getMonth() === cursor.month;
  }).length;

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
            onClick={() => setCursor({ year: today.getFullYear(), month: today.getMonth() })}
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
        {cells.map((date, i) => {
          if (!date) return <div key={`e-${i}`} className="min-h-[5.5rem] bg-surface/40" />;
          const k = dayKey(date);
          const dayItems = byDay.get(k) ?? [];
          const isToday = k === todayKey;
          return (
            <div key={k} className="min-h-[5.5rem] bg-surface p-1 text-left align-top">
              <div className={`mb-1 text-xs tabular-nums ${isToday ? "font-bold text-brand" : "text-ink-3"}`}>
                {isToday ? `● ${date.getDate()}` : date.getDate()}
              </div>
              <div className="flex flex-col gap-1">
                {dayItems.slice(0, 3).map((it) => {
                  const t = new Date(it.iso).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false });
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
