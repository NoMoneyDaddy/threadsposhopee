"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_SCRAPE_KEYWORD, MAX_SCRAPE_KEYWORDS, SCRAPE_POSTS_MIN, SCRAPE_POSTS_MAX, type ScrapeSort } from "@/lib/scrape-config";

// 自動抓文設定（一份可保存的設定，不綁發文帳號）：自訂多個關鍵字（去 Threads 搜含該字的貼文）、
// 每次抓幾篇、排序、日期區間、目標帳號。儲存後下次開頁自動帶出（保留上次設定）。抓到的一律進待審素材。
export default function ScrapeConfigForm({
  initial
}: {
  initial: { keywords: string[]; postsLimit: number; username: string; sort: ScrapeSort; after: string; before: string; enabled: boolean };
}) {
  const router = useRouter();
  const [keywords, setKeywords] = useState<string[]>(initial.keywords.length ? initial.keywords : [DEFAULT_SCRAPE_KEYWORD]);
  const [input, setInput] = useState("");
  const [postsLimit, setPostsLimit] = useState(initial.postsLimit);
  const [username, setUsername] = useState(initial.username ?? "");
  const [sort, setSort] = useState<ScrapeSort>(initial.sort ?? "recent");
  const [after, setAfter] = useState(initial.after ?? "");
  const [before, setBefore] = useState(initial.before ?? "");
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
        body: JSON.stringify({ keywords, postsLimit, username, sort, after, before, enabled })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setKeywords(json.config.keywords);
      setPostsLimit(json.config.postsLimit);
      setUsername(json.config.username ?? "");
      setSort(json.config.sort ?? "recent");
      setAfter(json.config.after ?? "");
      setBefore(json.config.before ?? "");
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
        設幾個<b>關鍵字</b>，系統就去 Threads 找含這些字的貼文當素材來源。預設用 <code className="rounded bg-surface-2 px-1">s.shopee.tw</code>，
        意思是抓那些內文帶蝦皮分潤連結的貼文。抓回來的都先放進<b>待審素材</b>，不會綁發文帳號、也不會自己發出去。
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
          每個關鍵字每次抓幾篇（{SCRAPE_POSTS_MIN}–{SCRAPE_POSTS_MAX}）
          <input
            type="number"
            min={SCRAPE_POSTS_MIN}
            max={SCRAPE_POSTS_MAX}
            // 允許清空重打：空字串時存 NaN 顯示為空（不卡個 0）；存檔時由伺服端 normalizePostsLimit 夾回範圍。
            value={Number.isNaN(postsLimit) ? "" : postsLimit}
            onChange={(e) => setPostsLimit(e.target.value === "" ? NaN : Number(e.target.value))}
            className="ml-2 w-20 rounded-xl border px-2 py-1 text-sm"
          />
        </label>
      </div>

      <div>
        <label className="mb-1 block text-xs text-ink-2">想盯哪個帳號（選填）</label>
        <input
          className="w-56 rounded-xl border px-3 py-1.5 text-sm"
          placeholder="例如 shopee_tw，留空就搜全部"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          inputMode="text"
          autoCapitalize="none"
          autoCorrect="off"
        />
        <p className="mt-1 text-xs text-ink-3">
          填了就只在這個帳號的貼文裡找上面的關鍵字，留空就是整個 Threads 都搜。帳號只會用到英數字、底線和點，不用加 @。
        </p>
      </div>

      <div>
        <label className="mb-1 block text-xs text-ink-2">排序方式</label>
        <select
          className="w-40 rounded-xl border px-3 py-1.5 text-sm"
          value={sort}
          onChange={(e) => setSort(e.target.value === "top" ? "top" : "recent")}
        >
          <option value="recent">最新（依時間）</option>
          <option value="top">熱門（依互動）</option>
        </select>
        <p className="mt-1 text-xs text-ink-3">
          搜不太到東西時，可以換成「熱門」試試，常常比「最新」找得到更多貼文。
        </p>
      </div>

      <div>
        <label className="mb-1 block text-xs text-ink-2">只抓這段日期內的貼文（選填）</label>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <input
            type="date"
            value={after}
            onChange={(e) => setAfter(e.target.value)}
            aria-label="起始日"
            className="rounded-xl border px-3 py-1.5"
          />
          <span className="text-ink-3">到</span>
          <input
            type="date"
            value={before}
            onChange={(e) => setBefore(e.target.value)}
            aria-label="結束日"
            className="rounded-xl border px-3 py-1.5"
          />
        </div>
        <p className="mt-1 text-xs text-ink-3">兩格都留空就不限日期。只想要近期的貼文時再填。</p>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-2">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4" />
        啟用後，按「立即抓取」就會跑這些關鍵字；停用的話這次先跳過。系統不會在背景自己偷抓。
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
