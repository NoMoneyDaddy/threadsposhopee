"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RECOMMENDED_MIN_GAP_MINUTES, parseSlots } from "@/lib/publish-prefs";

// 常用時段快捷：點一下帶入。
const PRESETS: { label: string; value: string }[] = [
  { label: "早中晚 3 篇", value: "09:00,12:30,20:00" },
  { label: "早晚 2 篇", value: "08:30,21:00" },
  { label: "午晚 2 篇", value: "12:30,20:00" },
  { label: "整點 4 篇", value: "09:00,13:00,18:00,21:00" }
];

// 可點選的整點時段格子（06:00–23:00）：點一下加入/移除，免手打；特殊分鐘（如 12:30）仍可用下方輸入框。
const GRID_TIMES = Array.from({ length: 18 }, (_, i) => `${String(i + 6).padStart(2, "0")}:00`);

// 每位使用者自訂發文節奏（防封排程）：發文時段、同帳號最小間隔、每帳號每日上限。留空沿用系統預設。
export default function PublishPrefsForm({
  initial
}: {
  initial: { slots: string[]; minGapMinutes: number; maxPerDay: number };
}) {
  const router = useRouter();
  const [slots, setSlots] = useState(initial.slots.join(","));
  const [gap, setGap] = useState(String(initial.minGapMinutes));
  const [maxPerDay, setMaxPerDay] = useState(String(initial.maxPerDay));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const parsedSlots = parseSlots(slots);
  // 任一非空 token 不符合 HH:MM 就算無效（不只「全部都無效」才擋）：
  // 例如 09:00,25:00 後端會默默丟掉 25:00，這裡先擋下，避免顯示與實際儲存不一致。
  const slotsInvalid = slots
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .some((t) => parseSlots(t).length === 0);
  const gapNum = Number(gap);
  const gapValid = Number.isFinite(gapNum) && gapNum > 0;
  const lowGap = gapValid && gapNum < RECOMMENDED_MIN_GAP_MINUTES;
  // 把分鐘換算成「X 小時 Y 分」，讓使用者一眼看懂間隔長度（<60 分不顯示，避免「0 小時」冗餘）。
  const gapHuman = gapValid && gapNum >= 60 ? `約 ${Math.floor(gapNum / 60)} 小時${gapNum % 60 ? ` ${gapNum % 60} 分` : ""}` : "";

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/accounts/publish-prefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slots, minGapMinutes: gap, maxPerDay })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setMsg("✅ 已儲存");
      router.refresh();
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  // 整點格子：點一下加入/移除該時段（依時間排序輸出，與顯示一致；HH:MM 字典序＝時間序）。
  const slotSet = new Set(parsedSlots);
  const toggleSlot = (t: string) => {
    const next = new Set(parsedSlots);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    setSlots(Array.from(next).sort().join(","));
  };

  return (
    <div className="card p-4">
      <div className="mb-1 font-medium">發文節奏（防封排程）</div>
      <p className="mb-3 text-xs text-ink-2">
        按「加入佇列」發文時，系統會模擬真人、避免被判定洗版而降觸及或封號，依下面三項規則自動排到最近的空檔：
      </p>
      <ol className="mb-4 list-decimal space-y-0.5 pl-5 text-xs text-ink-2">
        <li>只在你設定的「發文時段」內發</li>
        <li>同一個帳號，兩篇之間至少間隔你設定的時間</li>
        <li>同一個帳號，每天最多發你設定的篇數</li>
      </ol>

      {/* ① 發文時段 */}
      <div className="mb-4">
        <label htmlFor="pp-slots" className="block text-sm font-medium text-ink">
          ① 發文時段
        </label>
        <p className="mb-1.5 text-xs text-ink-3">每天會在這些時刻附近發文（台北時間）。點時間格子加入/移除，或用快捷；特殊分鐘（如 12:30）可用最下方輸入框。</p>
        {/* 整點時段多選格子：點選即加入/移除，免手打 */}
        <div className="mb-2 grid grid-cols-6 gap-1 sm:grid-cols-9">
          {GRID_TIMES.map((t) => {
            const on = slotSet.has(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleSlot(t)}
                aria-pressed={on}
                className={
                  "rounded-md border px-1 py-1 text-xs tabular-nums " +
                  (on ? "border-brand bg-brand text-white" : "text-ink-2 hover:bg-surface-2")
                }
              >
                {t}
              </button>
            );
          })}
        </div>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setSlots(p.value)}
              className="rounded-full border px-2.5 py-1 text-xs text-ink-2 hover:bg-surface-2"
            >
              {p.label}
            </button>
          ))}
        </div>
        <input
          id="pp-slots"
          className="input"
          placeholder="例如 09:00,12:30,20:00（留空＝用系統預設時段）"
          value={slots}
          onChange={(e) => setSlots(e.target.value)}
          aria-label="發文時段"
        />
        {parsedSlots.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {parsedSlots.map((s) => (
              <span key={s} className="rounded-md bg-surface-2 px-2 py-0.5 text-xs tabular-nums text-ink-2">
                {s}
              </span>
            ))}
            <span className="self-center text-xs text-ink-3">每天 {parsedSlots.length} 篇時段</span>
          </div>
        )}
        {slotsInvalid && (
          <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-700">
            ⚠️ 格式需為 HH:MM（24 小時制），多個用逗號分隔，例如 09:00,12:30,20:00
          </p>
        )}
      </div>

      {/* ② 最小間隔 ③ 每日上限 */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="pp-gap" className="block text-sm font-medium text-ink">
            ② 同帳號最小間隔
          </label>
          <p className="mb-1.5 text-xs text-ink-3">同一帳號兩篇之間最少要隔多久（分鐘）。</p>
          <div className="flex items-center gap-2">
            <input
              id="pp-gap"
              className="input w-28"
              inputMode="numeric"
              value={gap}
              onChange={(e) => /^\d*$/.test(e.target.value) && setGap(e.target.value)}
              aria-label="最小間隔（分）"
            />
            <span className="text-xs text-ink-3">分{gapHuman && `（${gapHuman}）`}</span>
          </div>
          {lowGap && (
            <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-700">
              ⚠️ 小於 4 小時（{RECOMMENDED_MIN_GAP_MINUTES} 分）較易被判異常，建議 ≥ 4 小時。
            </p>
          )}
        </div>
        <div>
          <label htmlFor="pp-max" className="block text-sm font-medium text-ink">
            ③ 每日上限（每帳號）
          </label>
          <p className="mb-1.5 text-xs text-ink-3">同一帳號 24 小時內最多發幾篇。</p>
          <div className="flex items-center gap-2">
            <input
              id="pp-max"
              className="input w-28"
              inputMode="numeric"
              value={maxPerDay}
              onChange={(e) => /^\d*$/.test(e.target.value) && setMaxPerDay(e.target.value)}
              aria-label="每日上限"
            />
            <span className="text-xs text-ink-3">篇／天</span>
          </div>
          <p className="mt-1 text-xs text-ink-3">Threads 硬上限 250；防封建議 8–15。</p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button onClick={save} disabled={busy || slotsInvalid} className="btn btn-brand">
          {busy ? "儲存中…" : "儲存節奏設定"}
        </button>
        {msg && <span className="text-sm text-ink-2" role="status" aria-live="polite">{msg}</span>}
      </div>
    </div>
  );
}
