"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RECOMMENDED_MIN_GAP_MINUTES } from "@/lib/publish-prefs";

const HHMM = /^([01]?\d|2[0-3]):[0-5]\d$/;
// 解析使用者輸入的時段字串為合法且去重的 HH:MM 清單（與後端 parseSlots 同規則，供即時預覽）。
function parseSlotsClient(raw: string): string[] {
  const out: string[] = [];
  for (const s of raw.split(",").map((x) => x.trim())) {
    if (HHMM.test(s) && !out.includes(s)) out.push(s);
  }
  return out;
}

// 常用時段快捷：點一下帶入。
const PRESETS: { label: string; value: string }[] = [
  { label: "早中晚 3 篇", value: "09:00,12:30,20:00" },
  { label: "早晚 2 篇", value: "08:30,21:00" },
  { label: "午晚 2 篇", value: "12:30,20:00" },
  { label: "整點 4 篇", value: "09:00,13:00,18:00,21:00" }
];

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

  const parsedSlots = parseSlotsClient(slots);
  const slotsInvalid = slots.trim() !== "" && parsedSlots.length === 0;
  const gapNum = Number(gap);
  const gapValid = Number.isFinite(gapNum) && gapNum > 0;
  const lowGap = gapValid && gapNum < RECOMMENDED_MIN_GAP_MINUTES;
  // 把分鐘換算成「X 小時 Y 分」，讓使用者一眼看懂間隔長度。
  const gapHuman = gapValid ? `約 ${Math.floor(gapNum / 60)} 小時${gapNum % 60 ? ` ${gapNum % 60} 分` : ""}` : "";

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
        <p className="mb-1.5 text-xs text-ink-3">每天會在這些時刻附近發文（台北時間）。點下方快捷帶入，或自己輸入 HH:MM、用逗號分隔。</p>
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
