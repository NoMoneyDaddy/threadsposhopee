"use client";

import { useEffect, useRef, useState } from "react";
import type { DraftMedia, ThreadSegment } from "@/lib/types";
import ThreadsPreview, { CharCount } from "@/components/ThreadsPreview";
import MediaPicker from "@/components/MediaPicker";
import { fetchWithTimeout } from "@/lib/http";

const inputCls = "w-full rounded-xl border px-3 py-2 text-sm";
export const THREADS_LIMIT = 500;
export const MAX_EXTRA_SEGMENTS = 10; // 與後端 compose route 上限一致

// 一篇貼文的可編輯內容（主文＋留言＋多段串文＋各段媒體）。發文/草稿/素材三處共用同一形狀。
export interface PostContent {
  mainText: string;
  replyText: string;
  mainMedia: DraftMedia[];
  replyMedia: DraftMedia[];
  extraSegments: ThreadSegment[];
}

export const emptyPostContent = (): PostContent => ({
  mainText: "",
  replyText: "",
  mainMedia: [],
  replyMedia: [],
  extraSegments: []
});

// 共用貼文編輯器（受控元件）：左邊編輯、右邊 ThreadsPreview 即時預覽（所見即所得）。
// 與發文頁一致：正文／留言／多段串文 3/n+、各段媒體、AI「換個說法」。
// replyDelay 為發文/草稿專用（留言延遲），素材不需要：未傳 onReplyDelayChange 即不顯示。
export default function PostEditor({
  value,
  onChange,
  cloud = null,
  preset = null,
  accountLabel,
  replyDelay,
  onReplyDelayChange,
  threadContext,
  onAutosave,
  autosaveDelayMs = 1500,
  limit = THREADS_LIMIT
}: {
  value: PostContent;
  onChange: (next: PostContent) => void;
  cloud?: string | null;
  preset?: string | null;
  accountLabel?: string | null;
  replyDelay?: string;
  onReplyDelayChange?: (v: string) => void;
  // 有商品情境（素材/草稿）時顯示「AI 生成串文」：依商品名/來源產多段，分潤連結附最後一段。
  threadContext?: { productName?: string | null; affiliateLink?: string | null; sourceText?: string | null };
  // 邊打邊自動存進度（debounce）：有 id 的素材/草稿存 DB、發文頁存 localStorage。未傳＝不自動存。
  onAutosave?: (value: PostContent) => Promise<void>;
  autosaveDelayMs?: number;
  limit?: number;
}) {
  const set = (patch: Partial<PostContent>) => onChange({ ...value, ...patch });

  // 「換個說法」：AI 改寫出多個版本供挑選。
  const [variations, setVariations] = useState<string[]>([]);
  const [rewriting, setRewriting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const canGenThread = Boolean(threadContext && (threadContext.productName || threadContext.affiliateLink));

  async function genThread() {
    if (!threadContext) return;
    setGenerating(true);
    setErr(null);
    try {
      const res = await fetchWithTimeout(
        "/api/ai/thread",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productName: threadContext.productName ?? "",
            affiliateLink: threadContext.affiliateLink ?? "",
            sourceText: threadContext.sourceText ?? ""
          })
        },
        30000
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || `生成失敗（${res.status}）`);
      // 只覆寫文字段落，保留既有媒體。
      onChange({
        ...value,
        mainText: typeof json.mainText === "string" ? json.mainText : value.mainText,
        replyText: typeof json.replyText === "string" ? json.replyText : value.replyText,
        extraSegments: Array.isArray(json.extraSegments) ? json.extraSegments : value.extraSegments
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }
  // 正文一變動即讓舊的改寫版本失效，避免點到過期內容。
  useEffect(() => {
    setVariations([]);
  }, [value.mainText]);

  // 自動存進度（debounce）：內容變動 autosaveDelayMs 後呼叫 onAutosave；跳過初次掛載。
  const [autoStatus, setAutoStatus] = useState<"" | "saving" | "saved" | "error">("");
  const firstAutosave = useRef(true);
  useEffect(() => {
    if (!onAutosave) return;
    if (firstAutosave.current) {
      firstAutosave.current = false;
      return;
    }
    const t = setTimeout(async () => {
      setAutoStatus("saving");
      try {
        await onAutosave(value);
        setAutoStatus("saved");
      } catch {
        setAutoStatus("error");
      }
    }, autosaveDelayMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  async function rewrite() {
    if (!value.mainText.trim()) return;
    setRewriting(true);
    setErr(null);
    setVariations([]);
    try {
      const res = await fetchWithTimeout(
        "/api/ai/rewrite",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: value.mainText }) },
        30000
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || `換句話說失敗（${res.status}）`);
      setVariations((json.variations as string[]) ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRewriting(false);
    }
  }

  return (
    <div className="space-y-3">
      {onAutosave && autoStatus && (
        <div className="text-right text-[11px] text-ink-3" role="status" aria-live="polite">
          {autoStatus === "saving" ? "自動儲存中…" : autoStatus === "saved" ? "✓ 已自動儲存" : "⚠️ 自動儲存失敗（請手動儲存）"}
        </div>
      )}
      <div>
        <label className="mb-1 block text-sm font-medium text-ink">正文</label>
        <textarea
          className={inputCls}
          rows={3}
          value={value.mainText}
          onChange={(e) => set({ mainText: e.target.value })}
          placeholder="有什麼新鮮事？直接打字分享…"
        />
        <div className="mt-1 flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {canGenThread && (
              <button
                type="button"
                onClick={genThread}
                disabled={generating || rewriting}
                title="依商品自動生成多段串文（主文＋後續），分潤連結會放在最後一段"
                className="rounded-full border border-brand/40 px-2.5 py-1 text-xs text-brand hover:bg-orange-50 disabled:opacity-50"
              >
                {generating ? "生成中…" : "✨ AI 生成串文"}
              </button>
            )}
            <button
              type="button"
              onClick={rewrite}
              disabled={rewriting || generating || !value.mainText.trim()}
              title={!value.mainText.trim() ? "請先輸入正文" : "用 AI 改寫出幾個不同說法供你挑選"}
              className="rounded-full border border-brand/40 px-2.5 py-1 text-xs text-brand hover:bg-orange-50 disabled:opacity-50"
            >
              {rewriting ? "改寫中…" : "✨ 換個說法"}
            </button>
          </div>
          <CharCount text={value.mainText} limit={limit} />
        </div>
        {err && <p className="mt-1 text-xs text-danger" role="alert">❌ {err}</p>}
        {variations.length > 0 && (
          <div className="mt-2 space-y-1.5 rounded-xl border border-dashed border-border bg-surface-2/50 p-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-ink-2">點一個版本即可套用</span>
              <button type="button" onClick={() => setVariations([])} aria-label="關閉版本清單" className="text-xs text-ink-3 hover:text-ink">
                ✕
              </button>
            </div>
            {variations.map((v, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  set({ mainText: v });
                  setVariations([]);
                }}
                className="block w-full whitespace-pre-wrap rounded-lg border bg-surface px-2.5 py-2 text-left text-sm text-ink hover:border-brand/50 hover:bg-orange-50"
              >
                {v}
              </button>
            ))}
          </div>
        )}
        <MediaPicker items={value.mainMedia} onChange={(m) => set({ mainMedia: typeof m === "function" ? m(value.mainMedia) : m })} cloud={cloud} preset={preset} hint="可加多張照片／影片（多張＝輪播）" />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-ink">留言（串文 2/2，選填）</label>
        <textarea
          className={inputCls + " text-xs"}
          rows={2}
          value={value.replyText}
          onChange={(e) => set({ replyText: e.target.value })}
          placeholder="留言區（選填，例如分潤連結）"
        />
        <div className="mt-2">
          <MediaPicker items={value.replyMedia} onChange={(m) => set({ replyMedia: typeof m === "function" ? m(value.replyMedia) : m })} cloud={cloud} preset={preset} hint="留言也可加多張照片／影片" />
        </div>
        {onReplyDelayChange && (value.replyText.trim() || value.replyMedia.length > 0) && (
          <div className="mt-2 flex items-center gap-2">
            <label className="text-xs text-ink-2">留言延遲幾分鐘後補上（留空就用預設值）</label>
            <input
              className="w-24 rounded-xl border px-2 py-1 text-xs"
              inputMode="numeric"
              placeholder="如 15"
              value={replyDelay ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                if (/^\d*$/.test(v) && (v === "" || Number(v) <= 1440)) onReplyDelayChange(v);
              }}
            />
          </div>
        )}
      </div>

      {/* 更多串文段落（3/n…）：留言之後再依序補發 */}
      <div className="space-y-2">
        {value.extraSegments.map((seg, i) => (
          <div key={i} className="rounded-xl border border-dashed border-border p-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-ink-2">串文第 {i + 3} 段</span>
              <button
                type="button"
                onClick={() => set({ extraSegments: value.extraSegments.filter((_, j) => j !== i) })}
                aria-label={`移除第 ${i + 3} 段`}
                className="text-xs text-ink-3 hover:text-red-500"
              >
                移除
              </button>
            </div>
            <textarea
              className={inputCls + " text-xs"}
              rows={2}
              value={seg.text ?? ""}
              onChange={(e) => set({ extraSegments: value.extraSegments.map((s, j) => (j === i ? { ...s, text: e.target.value } : s)) })}
              placeholder={`第 ${i + 3} 段內容…`}
            />
            <div className="mt-1 flex justify-end">
              <CharCount text={seg.text ?? ""} limit={limit} />
            </div>
            <div className="mt-1">
              <MediaPicker
                items={seg.media ?? []}
                onChange={(action) =>
                  set({
                    extraSegments: value.extraSegments.map((s, j) => {
                      if (j !== i) return s;
                      const cur = s.media ?? [];
                      const next = typeof action === "function" ? (action as (p: DraftMedia[]) => DraftMedia[])(cur) : action;
                      return { ...s, media: next };
                    })
                  })
                }
                cloud={cloud}
                preset={preset}
                hint="這段也可加多張照片／影片"
              />
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => set({ extraSegments: value.extraSegments.length >= MAX_EXTRA_SEGMENTS ? value.extraSegments : [...value.extraSegments, { text: "", media: [] }] })}
          disabled={value.extraSegments.length >= MAX_EXTRA_SEGMENTS}
          title={value.extraSegments.length >= MAX_EXTRA_SEGMENTS ? `串文段落最多 ${MAX_EXTRA_SEGMENTS} 段` : undefined}
          className="rounded-full border border-border px-3 py-1 text-xs text-ink-2 hover:bg-surface-2 disabled:opacity-50"
        >
          ＋ 新增串文段落
        </button>
      </div>

      <ThreadsPreview
        accountLabel={accountLabel ?? undefined}
        mainText={value.mainText}
        replyText={value.replyText}
        media={value.mainMedia}
        replyMedia={value.replyMedia}
        extraSegments={value.extraSegments}
      />
    </div>
  );
}
