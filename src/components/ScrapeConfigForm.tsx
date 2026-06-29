"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_SCRAPE_KEYWORD, MAX_SCRAPE_KEYWORDS, SCRAPE_POSTS_MIN, SCRAPE_POSTS_MAX } from "@/lib/scrape-config";

// 自動抓文設定（一份可保存的設定，不綁發文帳號）：自訂多個關鍵字（去 Threads 搜含該字的貼文）、
// 每次抓幾篇。儲存後下次開頁自動帶出（保留上次設定）。抓到的一律進待審素材，發文帳號之後排程才選。
export default function ScrapeConfigForm({
  initial
}: {
  initial: { keywords: string[]; postsLimit: number; enabled: boolean };
}) {
  const router = useRouter();
  const [keywords, setKeywords] = useState<string[]>(initial.keywords.length ? initial.keywords : [DEFAULT_SCRAPE_KEYWORD]);
  const [input, setInput] = useState("");
  const [postsLimit, setPostsLimit] = useState(initial.postsLimit);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function addKeyword(raw: string) {
    const k = raw.trim();
    if (!k) return;
    setKeywords((prev) => (prev.includes(k) || prev.length >= MAX_SCRAPE_KEYWORDS ? prev : [...prev, k]));
    setInput("");
  }
  function removeKeyword(k: string) {
    setKeywords((prev) => prev.filter((x) => x !== k));
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/scrape-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords, postsLimit, enabled })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setKeywords(json.config.keywords);
      setPostsLimit(json.config.postsLimit);
      setEnabled(json.config.enabled);
      setMsg("已儲存設定（下次開頁自動帶出）");
      router.refresh();
    } catch (e) {
      setMsg(`儲存失敗：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  const canDefault = !keywords.includes(DEFAULT_SCRAPE_KEYWORD) && keywords.length < MAX_SCRAPE_KEYWORDS;

  return (
    <div className="space-y-3 rounded-2xl border bg-surface p-4">
      <div className="font-medium">抓文設定</div>
      <p className="text-xs text-ink-3">
        設定多個<b>關鍵字</b>，系統會去 Threads 搜「含該關鍵字的貼文」當素材來源。預設 <code className="rounded bg-surface-2 px-1">s.shopee.tw</code>
        ＝抓「貼文裡帶蝦皮分潤連結」的貼文。抓到的一律進<b>待審素材</b>，不綁發文帳號、不自動發文。
      </p>

      <div>
        <label className="mb-1 block text-xs text-ink-2">關鍵字（可多個，最多 {MAX_SCRAPE_KEYWORDS} 個）</label>
        <div className="flex flex-wrap items-center gap-1.5">
          {keywords.map((k) => (
            <span key={k} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs text-ink">
              {k}
              <button
                type="button"
                aria-label={`移除關鍵字 ${k}`}
                onClick={() => removeKeyword(k)}
                className="grid h-4 w-4 place-items-center rounded-full text-ink-3 hover:bg-border hover:text-ink"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </span>
          ))}
          {keywords.length === 0 && <span className="text-xs text-ink-3">尚未設定關鍵字</span>}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            className="w-48 rounded-xl border px-3 py-1.5 text-sm"
            placeholder="輸入關鍵字後按 Enter"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addKeyword(input);
              }
            }}
            disabled={keywords.length >= MAX_SCRAPE_KEYWORDS}
          />
          <button type="button" onClick={() => addKeyword(input)} disabled={!input.trim() || keywords.length >= MAX_SCRAPE_KEYWORDS} className="rounded-xl border px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-50">
            加入
          </button>
          {canDefault && (
            <button type="button" onClick={() => addKeyword(DEFAULT_SCRAPE_KEYWORD)} className="rounded-xl border border-dashed px-3 py-1.5 text-xs text-ink-2 hover:bg-surface-2">
              ＋ 預設 s.shopee.tw
            </button>
          )}
        </div>
      </div>

      <div>
        <label className="text-xs text-ink-2">
          每個關鍵字每次抓幾篇
          <input
            type="number"
            min={SCRAPE_POSTS_MIN}
            max={SCRAPE_POSTS_MAX}
            value={postsLimit}
            onChange={(e) => setPostsLimit(Number(e.target.value))}
            className="ml-2 w-20 rounded-xl border px-2 py-1 text-sm"
          />
        </label>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-2">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4" />
        啟用（按「立即抓取」時納入這些關鍵字；停用＝暫時略過，本服務無背景自動抓取）
      </label>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={busy} className="btn btn-brand">
          {busy ? "儲存中…" : "儲存設定"}
        </button>
        {msg && <span className="text-sm text-ink-2" role="status" aria-live="polite">{msg}</span>}
      </div>
    </div>
  );
}
