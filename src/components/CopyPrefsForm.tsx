"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CopyPrefs, SidePrefs, Tone, Length, EmojiLevel } from "@/services/ai/prefs";

const TONE_OPTS: { v: Tone; label: string }[] = [
  { v: "friendly", label: "朋友閒聊" },
  { v: "professional", label: "專業推薦" },
  { v: "humorous", label: "幽默自嘲" },
  { v: "concise", label: "精簡直接" }
];
const LENGTH_OPTS: { v: Length; label: string }[] = [
  { v: "short", label: "短" },
  { v: "medium", label: "中" },
  { v: "long", label: "長" }
];
const EMOJI_OPTS: { v: EmojiLevel; label: string }[] = [
  { v: "none", label: "不用" },
  { v: "few", label: "少量" },
  { v: "some", label: "適中" }
];

const sel = "rounded-xl border px-2 py-1 text-sm";

function SideEditor({
  title,
  side,
  onChange
}: {
  title: string;
  side: SidePrefs;
  onChange: (s: SidePrefs) => void;
}) {
  return (
    <div className="rounded-xl border bg-surface-2 p-3">
      <div className="mb-2 text-sm font-medium">{title}</div>
      <div className="flex flex-wrap gap-3">
        <label className="text-xs text-ink-2">
          語氣
          <select className={`${sel} ml-1`} value={side.tone} onChange={(e) => onChange({ ...side, tone: e.target.value as Tone })}>
            {TONE_OPTS.map((o) => (
              <option key={o.v} value={o.v}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-ink-2">
          長度
          <select className={`${sel} ml-1`} value={side.length} onChange={(e) => onChange({ ...side, length: e.target.value as Length })}>
            {LENGTH_OPTS.map((o) => (
              <option key={o.v} value={o.v}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-ink-2">
          Emoji
          <select className={`${sel} ml-1`} value={side.emoji} onChange={(e) => onChange({ ...side, emoji: e.target.value as EmojiLevel })}>
            {EMOJI_OPTS.map((o) => (
              <option key={o.v} value={o.v}>{o.label}</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

// AI 文案客製化：語氣/長度/emoji（正文與留言分開）、溫度、自訂指示。各人各設各的。
export default function CopyPrefsForm({ initial }: { initial: CopyPrefs }) {
  const router = useRouter();
  const [prefs, setPrefs] = useState<CopyPrefs>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/accounts/copy-prefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefs })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setPrefs(json.prefs);
      setMsg("✅ 已儲存");
      router.refresh();
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border bg-surface p-4">
      <div className="mb-1 font-medium">AI 文案客製化</div>
      <p className="mb-3 text-xs text-ink-2">生成貼文時套用的全域偏好。正文與留言可分開設定。</p>

      <div className="grid gap-3 md:grid-cols-2">
        <SideEditor title="正文" side={prefs.main} onChange={(main) => setPrefs((p) => ({ ...p, main }))} />
        <SideEditor title="留言（分潤連結）" side={prefs.reply} onChange={(reply) => setPrefs((p) => ({ ...p, reply }))} />
      </div>

      <div className="mt-3">
        <label className="text-xs text-ink-2">
          創意度（溫度）：<b className="tabular-nums">{prefs.temperature.toFixed(2)}</b>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={prefs.temperature}
            onChange={(e) => setPrefs((p) => ({ ...p, temperature: Number(e.target.value) }))}
            className="ml-2 w-48 align-middle"
          />
          <span className="ml-2 text-ink-3">低=穩定，高=發散</span>
        </label>
      </div>

      <div className="mt-3">
        <label htmlFor="copy-prefs-custom-prompt" className="text-xs text-ink-2">
          自訂指示（選填，不可違反輸出格式）
        </label>
        <textarea
          id="copy-prefs-custom-prompt"
          className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
          rows={2}
          maxLength={1000}
          placeholder="例如：多強調保固與台灣出貨；不要提到價格"
          value={prefs.customPrompt ?? ""}
          onChange={(e) => setPrefs((p) => ({ ...p, customPrompt: e.target.value }))}
        />
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button onClick={save} disabled={busy} className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {busy ? "儲存中…" : "儲存偏好"}
        </button>
        {msg && <span className="text-sm text-ink-2">{msg}</span>}
      </div>
    </div>
  );
}
