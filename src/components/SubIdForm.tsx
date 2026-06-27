"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { isValidSubIdTemplate } from "@/services/shopee/subid";

// 蝦皮分潤連結自訂來源標記 Sub id：對齊蝦皮後台的 5 格（sub_id1..5），可增刪。
// 每格支援範本變數 {platform}/{account}/{item}，發文建連結時自動代換。
// 註：已移除 {date}/{time}——其值是「建連結當下」非實際發文時間，易誤解；後端 resolver 仍保留代換以相容舊資料。
// 儲存：以逗號分隔成單一字串。留空＝不帶來源標記（無預設）。
const VARS = ["{platform}", "{account}", "{item}"];

// 官方規範：sub_id 僅能含英數與底線（值不可含「-」，那是 5 格的分隔符）。
// 輸入時即過濾：只留英數、底線與變數所需的大括號，讓「所見＝所存」、不再默默被清掉。
function sanitizeSubIdInput(v: string): string {
  return v.replace(/[^A-Za-z0-9_{}]/g, "").slice(0, 50);
}

export default function SubIdForm({ initial }: { initial: string | null }) {
  const router = useRouter();
  const parse = (s: string | null) =>
    (s ?? "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 5);
  const [slots, setSlots] = useState<string[]>(() => {
    const init = parse(initial);
    return init.length ? init : [""];
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function setSlot(i: number, v: string) {
    setSlots((prev) => prev.map((s, idx) => (idx === i ? sanitizeSubIdInput(v) : s)));
  }
  function removeSlot(i: number) {
    setSlots((prev) => (prev.length <= 1 ? [""] : prev.filter((_, idx) => idx !== i)));
  }
  function addSlot() {
    setSlots((prev) => (prev.length >= 5 ? prev : [...prev, ""]));
  }
  function appendVar(i: number, tok: string) {
    setSlots((prev) => prev.map((s, idx) => (idx === i ? (s + tok).slice(0, 50) : s)));
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const value = slots.map((s) => s.trim()).filter(Boolean).join(",");
      const res = await fetch("/api/accounts/shopee-sub-id", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sub_id: value })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      const saved = parse(json.subId ?? "");
      setSlots(saved.length ? saved : [""]);
      setMsg(json.subId ? "✅ 已儲存" : "✅ 已清除");
      router.refresh();
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-4">
      <div className="mb-1 font-medium">蝦皮分潤連結自訂來源標記 Sub id（選填）</div>
      <p className="mb-3 text-xs text-ink-2">
        對齊蝦皮後台的 5 格 Sub id，出現在分潤報表方便分辨來源。<b>僅能含英數與底線</b>、單格上限 50。
        可用變數（發文時自動代換）：
        {VARS.map((v) => (
          <code key={v} className="ml-1 font-mono">
            {v}
          </code>
        ))}
        。留空＝不帶來源標記。
      </p>

      <div className="space-y-3">
        {slots.map((slot, i) => (
          <div key={i}>
            <label className="label" htmlFor={`subid-${i}`}>
              Sub id {i + 1}
            </label>
            <div className="flex items-center gap-2">
              <input
                id={`subid-${i}`}
                className="input min-w-0 flex-1"
                placeholder="例如 Electronics_FB_1212"
                value={slot}
                maxLength={50}
                onChange={(e) => setSlot(i, e.target.value)}
              />
              <button
                type="button"
                onClick={() => removeSlot(i)}
                aria-label={`移除 Sub id ${i + 1}`}
                title="移除"
                className="shrink-0 rounded-lg border px-2 py-2 text-ink-3 hover:bg-surface-2 hover:text-danger"
              >
                🗑
              </button>
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {VARS.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => appendVar(i, v)}
                  className="rounded border border-brand/40 px-1.5 py-0.5 font-mono text-[11px] text-brand hover:bg-orange-50"
                >
                  {v}
                </button>
              ))}
            </div>
            {slot.trim() && !isValidSubIdTemplate(slot) && (
              <p className="mt-1 text-[11px] text-amber-700">⚠️ 僅能用英數、底線與上方變數（如 {"{date}"}）；大括號需成對。</p>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addSlot}
        disabled={slots.length >= 5}
        className="mt-3 flex items-center gap-1 text-sm text-brand hover:underline disabled:cursor-not-allowed disabled:text-ink-3 disabled:no-underline"
      >
        ＋ 添加辨識參數 Sub id（非必填）（{slots.length}/5）
      </button>

      <div className="mt-3">
        <button onClick={save} disabled={busy} className="btn btn-brand">
          {busy ? "儲存中…" : "儲存"}
        </button>
        {msg && <span className="ml-2 text-sm text-ink-2">{msg}</span>}
      </div>
    </div>
  );
}
