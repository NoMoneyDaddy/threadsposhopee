"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GEMINI_MODELS, estimatedPostsPerDay } from "@/lib/ai-models";

// 使用者自選 AI 文案模型＋免費額度概估。空值＝沿用全站預設（envDefault 僅供顯示）。
export default function GeminiModelForm({ initial, envDefault }: { initial: string | null; envDefault: string }) {
  const router = useRouter();
  const [model, setModel] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/accounts/gemini-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "儲存失敗");
      setMsg("已儲存");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card-p space-y-3">
      <div>
        <div className="font-medium">AI 文案模型</div>
        <p className="text-xs text-ink-3">選你 Gemini 金鑰要用的模型；越便宜的免費額度通常越多。</p>
      </div>
      <div>
        <label className="label" htmlFor="gemini-model">使用的模型</label>
        <select id="gemini-model" className="input" value={model} onChange={(e) => setModel(e.target.value)}>
          <option value="">使用預設（{envDefault}）</option>
          {GEMINI_MODELS.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-xs">
          <thead className="bg-surface-2 text-left text-ink-2">
            <tr>
              <th className="px-3 py-1.5">模型</th>
              <th className="px-3 py-1.5">免費層每日上限*</th>
              <th className="px-3 py-1.5">約可生成</th>
              <th className="px-3 py-1.5">說明</th>
            </tr>
          </thead>
          <tbody>
            {GEMINI_MODELS.map((m) => (
              <tr key={m.id} className="border-t">
                <td className="px-3 py-1.5 font-medium">{m.label}</td>
                <td className="px-3 py-1.5 tabular-nums">約 {m.freeRpd} 次/日</td>
                <td className="px-3 py-1.5 tabular-nums">約 {estimatedPostsPerDay(m.freeRpd)} 篇/日</td>
                <td className="px-3 py-1.5 text-ink-3">{m.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-3">
        *免費額度為<b>概估</b>、會隨 Google 政策變動（每篇文案約 1 次 AI 呼叫）；實際以{" "}
        <a href="https://aistudio.google.com/rate-limit" target="_blank" rel="noopener noreferrer" className="text-brand underline">
          Google AI Studio 額度頁
        </a>{" "}
        為準。超過免費額度後依各模型計價收費（算在你自己的 Google 帳號）。
      </p>

      <button onClick={save} disabled={busy} className="btn btn-brand btn-sm">
        {busy ? "儲存中…" : "儲存模型"}
      </button>
      {msg && <p className="text-sm text-ink-2">{msg}</p>}
    </div>
  );
}
