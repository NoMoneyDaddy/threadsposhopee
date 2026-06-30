"use client";

import { useState, useEffect, memo } from "react";
import { useRouter } from "next/navigation";
import type { Draft } from "@/lib/types";
import ThreadsPreview from "@/components/ThreadsPreview";
import PostEditor, { type PostContent } from "@/components/PostEditor";
import { normalizeDraftMedia, normalizeReplyMedia, isQualifiedMediaSet } from "@/lib/media";
import { formatCommissionRate } from "@/lib/product-name";
import { checkThreadsContent, THREADS_MAX_HASHTAGS } from "@/lib/threads-content";
import { isLowRelevance } from "@/lib/relevance";

// memo：草稿列表（最多 100 張）在搜尋/篩選 re-render 時，只重繪 props 變動的卡片。
// 需搭配 DraftsExplorer 以 useCallback 穩定 onToggleSelect，否則 memo 失效。
// 草稿要發到的 Threads 帳號身分（供卡片標籤＋原生預覽顯示真實頭像/暱稱）。
export interface AccountMeta {
  label: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

function DraftCard({
  draft,
  dupSimilarity,
  account,
  fallbackAccount,
  sponsorEnabled = false,
  isSponsorPick = false,
  cloud = null,
  preset = null,
  selectable = false,
  selected = false,
  onToggleSelect
}: {
  draft: Draft;
  dupSimilarity?: number;
  account?: AccountMeta;
  // 草稿尚未指定發文帳號時，預覽改用此帳號（通常第一個帳號）的頭像/暱稱，避免空灰圈；
  // 卡片上方「@帳號」標籤仍只在真的指定帳號時才顯示。
  fallbackAccount?: AccountMeta;
  sponsorEnabled?: boolean;
  isSponsorPick?: boolean;
  cloud?: string | null; // 編輯器媒體上傳用（Cloudinary 直傳）
  preset?: string | null;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}) {
  // 預覽用帳號身分：優先指定帳號，否則退回 fallback（第一個帳號）。
  const previewAccount = account ?? fallbackAccount;
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [mainText, setMainText] = useState(draft.main_text ?? "");
  const [replyText, setReplyText] = useState(draft.reply_text ?? "");
  // 草稿 → 編輯器內容：主文媒體＝media；留言＋3/n+ 來自 thread_chain（[0]＝留言，其餘為 3/n+），
  // 無 thread_chain 時退回 reply_text/reply_media（向後相容）。
  const draftToContent = (d: typeof draft): PostContent => {
    const chain = Array.isArray(d.thread_chain) ? d.thread_chain : [];
    if (chain.length > 0) {
      return {
        mainText: d.main_text ?? "",
        replyText: chain[0]?.text ?? "",
        mainMedia: normalizeDraftMedia(d),
        replyMedia: chain[0]?.media ?? [],
        extraSegments: chain.slice(1)
      };
    }
    return {
      mainText: d.main_text ?? "",
      replyText: d.reply_text ?? "",
      mainMedia: normalizeDraftMedia(d),
      replyMedia: normalizeReplyMedia(d),
      extraSegments: []
    };
  };
  const [content, setContent] = useState<PostContent>(() => draftToContent(draft));
  // 留言延遲（分）：逐則覆寫，空＝用全域預設。與發文頁一致由 <PostEditor> 顯示輸入。
  const [replyDelay, setReplyDelay] = useState(draft.reply_delay_minutes != null ? String(draft.reply_delay_minutes) : "");
  // 次要動作收進「更多」：避免卡片一次塞太多按鈕（主要：核准發布／編輯／重試常駐）。
  const [showMore, setShowMore] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [compliance, setCompliance] = useState<{ risk: string; advice: string } | null>(null);
  const [variants, setVariants] = useState<{ mainText: string; replyText: string }[] | null>(null);

  // A/B 文案：一次產生多版本供挑選；套用走既有 edit（寫回正文／留言）。
  async function genVariants() {
    setBusy("variants");
    setMsg(null);
    setVariants(null);
    try {
      const res = await fetch("/api/drafts/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: draft.id, action: "variants", count: 2 })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setVariants(json.variants);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function runCompliance() {
    setBusy("compliance");
    setMsg(null);
    setCompliance(null);
    try {
      const res = await fetch("/api/drafts/compliance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: mainText })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setCompliance({ risk: json.risk, advice: json.advice });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  // datetime-local 值（瀏覽器本地時區）↔ ISO 互轉
  const toLocalInput = (iso?: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (x: number) => String(x).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const [schedTime, setSchedTime] = useState(toLocalInput(draft.scheduled_at));

  // 父層資料（router.refresh / 背景更新）變動時同步本地狀態。編輯中不覆蓋使用者輸入的 content。
  useEffect(() => {
    setMainText(draft.main_text ?? "");
    setReplyText(draft.reply_text ?? "");
    setSchedTime(toLocalInput(draft.scheduled_at));
    if (!editing) setContent(draftToContent(draft));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.main_text, draft.reply_text, draft.shopee_short_link, draft.media, draft.reply_media, draft.thread_chain, draft.scheduled_at, editing]);

  async function call(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action);
    setMsg(null);
    try {
      const res = await fetch("/api/drafts/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: draft.id, action, ...extra })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      if ((action === "regenerate" || action === "edit" || action === "refresh-link") && json.draft) {
        setMainText(json.draft.main_text ?? "");
        setReplyText(json.draft.reply_text ?? "");
        setContent(draftToContent(json.draft));
      }
      if (action === "edit") setEditing(false);
      if (action === "refresh-link") setMsg("已更新分潤連結（文內舊連結也一併換新）");
      if (action === "shorten") {
        const skipped = typeof json.skipped === "number" ? json.skipped : 0;
        setMsg(`已轉換 ${json.shortened} 個連結${skipped > 0 ? `（另有 ${skipped} 個超過上限未處理）` : ""}`);
      }
      if (action === "save-as-material") setMsg("已存成素材，可到素材頁重排（媒體含主文／留言指派）");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  // 自動存進度：編輯中邊打邊靜默存（edit action，不 refresh/不關閉）。失敗時 PostEditor 顯示提示。
  async function autosaveDraft(c: PostContent, signal?: AbortSignal) {
    const res = await fetch("/api/drafts/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        id: draft.id,
        action: "edit",
        main_text: c.mainText,
        reply_text: c.replyText,
        media: c.mainMedia.map(({ url, type }) => ({ url, type })),
        reply_media: c.replyMedia.map(({ url, type }) => ({ url, type })),
        thread_chain: c.extraSegments.length > 0 ? [{ text: c.replyText, media: c.replyMedia }, ...c.extraSegments] : []
      })
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) throw new Error("autosave failed");
  }

  const done = draft.status === "published" || draft.status === "rejected";

  // 合格素材組：主文＋留言所有媒體一起算，需 ≥1 影片 + ≥1 圖。
  const qualified = isQualifiedMediaSet([...normalizeDraftMedia(draft), ...normalizeReplyMedia(draft)]);
  const allInMain = draft.post_mode === "all_in_main";

  // 延遲留言（串文 2/2）狀態：主文已發、留言由 cron 之後補。只在有設定留言時提示。
  const rs = draft.reply_status;
  const showReply = draft.status === "published" && rs && rs !== "none";
  const fmtEta = (iso?: string | null) =>
    iso
      ? new Date(iso).toLocaleString("zh-TW", {
          timeZone: "Asia/Taipei",
          month: "numeric",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        })
      : "—";

  async function toggleSponsor() {
    setBusy("sponsor");
    setMsg(null);
    try {
      const res = await fetch("/api/drafts/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: draft.id, action: isSponsorPick ? "unset-sponsor" : "set-sponsor" })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={`flex min-w-0 flex-col rounded-2xl border bg-surface p-4 ${isSponsorPick ? "ring-1 ring-brand" : ""} ${selected ? "ring-1 ring-brand" : ""}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          {selectable && (
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect?.(draft.id)}
              aria-label="選取此草稿"
              className="shrink-0"
            />
          )}
          <span className="min-w-0 truncate text-sm font-medium text-ink">{draft.product_name ?? "（未知商品）"}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {isSponsorPick && (
            <span className="rounded bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand" title="此篇將作為今日贊助文，連結會以平台分潤連結發布">
              ★ 贊助文
            </span>
          )}
          {account?.label && (
            <span className="max-w-[8rem] truncate rounded bg-brand/10 px-2 py-0.5 text-xs text-brand" title={`發到 ${account.label}`}>
              @{account.label}
            </span>
          )}
          <span
            className={"rounded px-2 py-0.5 text-xs " + (qualified ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700")}
            title={qualified ? "合格素材組（含影片＋圖）" : "建議湊成 1 影片＋至少 1 圖，成效較佳"}
          >
            {qualified ? "✅ 合格" : "⚠️ 素材組"}
          </span>
          {allInMain && (
            <span className="rounded bg-surface-2 px-2 py-0.5 text-xs text-ink-2" title="影片＋圖＋分潤連結全發主文，不另發留言">
              全主文
            </span>
          )}
          <span className="rounded bg-surface-2 px-2 py-0.5 text-xs text-ink-2">{draft.status}</span>
        </span>
      </div>

      {sponsorEnabled && draft.threads_account_id && (
        <div className="mb-2 flex items-center gap-2 text-xs text-ink-2">
          <button
            onClick={toggleSponsor}
            disabled={busy === "sponsor"}
            className="rounded-lg border px-2 py-1 hover:bg-surface-2 disabled:opacity-50"
          >
            {isSponsorPick ? "取消今日贊助文" : "設為今日贊助文"}
          </button>
          <a href="/sponsored" className="underline hover:text-ink">規則</a>
        </div>
      )}

      {editing ? (
        <div className="space-y-2">
          {/* 與發文頁／素材一致的共用編輯器：主文／留言／多段串文 3/n+／媒體上傳／AI 換句話說／即時預覽。
              分潤連結用卡片下方「🔄 刷新分潤連結」更新，故此處不再有手填連結欄。 */}
          <PostEditor
            value={content}
            onChange={setContent}
            cloud={cloud}
            preset={preset}
            accountLabel={previewAccount?.label}
            replyDelay={replyDelay}
            onReplyDelayChange={setReplyDelay}
            threadContext={{ productName: draft.product_name, affiliateLink: draft.shopee_short_link, sourceText: draft.main_text }}
            onAutosave={autosaveDraft}
          />
          <div className="flex gap-2">
            <button
              disabled={busy === "edit"}
              onClick={() =>
                call("edit", {
                  main_text: content.mainText,
                  reply_text: content.replyText,
                  reply_delay_minutes: replyDelay.trim() === "" ? null : Number(replyDelay),
                  media: content.mainMedia.map(({ url, type }) => ({ url, type })),
                  reply_media: content.replyMedia.map(({ url, type }) => ({ url, type })),
                  // 多段串文：有 3/n+ 時送完整鏈（[0]＝留言）；無則送空陣列（後端清鏈，沿用 reply_*）。
                  thread_chain:
                    content.extraSegments.length > 0
                      ? [{ text: content.replyText, media: content.replyMedia }, ...content.extraSegments]
                      : []
                })
              }
              className="rounded bg-brand px-3 py-1 text-xs text-white disabled:opacity-50"
            >
              {busy === "edit" ? "儲存中…" : "儲存"}
            </button>
            <button onClick={() => { setContent(draftToContent(draft)); setEditing(false); }} className="rounded border px-3 py-1 text-xs">
              取消
            </button>
          </div>
        </div>
      ) : (
        // 預覽素材：仿 Threads 版面呈現正文／媒體（圖或影片）／留言區分潤連結
        <ThreadsPreview
          accountLabel={previewAccount?.label}
          displayName={previewAccount?.displayName}
          avatarUrl={previewAccount?.avatarUrl}
          mainText={mainText}
          replyText={replyText}
          mediaUrl={draft.cloudinary_media_url}
          mediaType={draft.media_type}
          media={normalizeDraftMedia(draft)}
          replyMedia={normalizeReplyMedia(draft)}
          extraSegments={Array.isArray(draft.thread_chain) ? draft.thread_chain.slice(1) : undefined}
        />
      )}

      <div className="mt-2 flex items-center gap-2">
        <a
          href={draft.shopee_short_link ?? "#"}
          target="_blank"
          rel="noreferrer"
          className="min-w-0 truncate text-xs text-brand hover:underline"
        >
          {draft.shopee_short_link}
        </a>
        {formatCommissionRate(draft.commission_rate) && (
          <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-2" title="建立時的分潤率（會隨時間變動）">
            分潤 {formatCommissionRate(draft.commission_rate)}
          </span>
        )}
      </div>

      {typeof dupSimilarity === "number" && (
        <div className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-700" role="alert">
          ⚠️ 文案與同帳號近期貼文高度相似（{Math.round(dupSimilarity * 100)}%），重複措辭易被降觸及，建議改寫再發。
        </div>
      )}

      {isLowRelevance(draft.product_name, mainText) && (
        <div className="mt-2 rounded bg-surface-2 p-2 text-xs text-ink-2" role="status">
          💡 小提醒：文案好像比較少提到這個商品，發布前順手帶一句，讀者比較不會搞混、觸及也更穩。
        </div>
      )}

      {(() => {
        const c = checkThreadsContent(mainText);
        if (c.ok) return null;
        return (
          <div className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-700" role="alert">
            {c.overLimit && <div>⚠️ 正文超過 500 字（目前 {c.chars}），Threads 會發布失敗。</div>}
            {c.tooManyHashtags && (
              <div>⚠️ 有 {c.hashtags} 個 hashtag，Threads 建議最多 {THREADS_MAX_HASHTAGS} 個（過多易被降觸及）。</div>
            )}
          </div>
        );
      })()}

      {!editing && mainText.trim() && (
        <div className="mt-2">
          <button
            disabled={!!busy}
            onClick={runCompliance}
            className="rounded border px-2.5 py-1 text-xs text-ink-2 hover:bg-surface-2 disabled:opacity-50"
          >
            {busy === "compliance" ? "AI 檢查中…" : "🛡️ AI 合規檢查"}
          </button>
          {compliance && (
            <div
              className={`mt-1 rounded p-2 text-xs ${
                compliance.risk === "高"
                  ? "bg-red-50 text-red-700"
                  : compliance.risk === "中"
                    ? "bg-amber-50 text-amber-700"
                    : "bg-emerald-50 text-emerald-700"
              }`}
              role="status"
            >
              風險：{compliance.risk}｜{compliance.advice}
            </div>
          )}
        </div>
      )}

      {!done && draft.status !== "needs_verification" && !editing && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            disabled={!!busy}
            onClick={() => call("publish")}
            className="rounded bg-brand px-3 py-1 text-xs text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy === "publish" ? "發布中…" : "核准並發布"}
          </button>
          {(draft.status === "failed" || draft.status === "publishing") && (
            <button
              disabled={!!busy}
              onClick={() => call("retry")}
              className="rounded border border-amber-300 px-3 py-1 text-xs text-amber-700 hover:bg-amber-50 disabled:opacity-50"
            >
              {busy === "retry" ? "重置中…" : "重試（重排）"}
            </button>
          )}
          <button disabled={!!busy} onClick={() => { setContent(draftToContent(draft)); setEditing(true); }} className="rounded border px-3 py-1 text-xs hover:bg-surface-2">
            編輯
          </button>
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            aria-expanded={showMore}
            className="rounded border px-3 py-1 text-xs text-ink-2 hover:bg-surface-2"
          >
            {showMore ? "收起" : "⋯ 更多"}
          </button>
          {showMore && (
            <>
              <button
                disabled={!!busy}
                onClick={() => call("shorten")}
                className="rounded border px-3 py-1 text-xs hover:bg-surface-2 disabled:opacity-50"
                title="把文章裡的連結換成你的短連結（可順便附分潤）"
              >
                {busy === "shorten" ? "轉換中…" : "套用短連結"}
              </button>
              {draft.clean_product_url && (
                <button
                  disabled={!!busy}
                  onClick={() => call("refresh-link")}
                  className="rounded border px-3 py-1 text-xs hover:bg-surface-2 disabled:opacity-50"
                  title="用目前的 Shopee 金鑰與 Sub id 設定重產分潤連結，並把文內舊連結換成新的"
                >
                  {busy === "refresh-link" ? "刷新中…" : "🔄 刷新分潤連結"}
                </button>
              )}
              <button
                disabled={!!busy}
                onClick={() => call("regenerate")}
                className="rounded border px-3 py-1 text-xs hover:bg-surface-2 disabled:opacity-50"
              >
                {busy === "regenerate" ? "重寫中…" : "AI 重寫"}
              </button>
              <button
                disabled={!!busy}
                onClick={genVariants}
                title="一次產生多個文案版本，挑一個套用（A/B）"
                className="rounded border px-3 py-1 text-xs hover:bg-surface-2 disabled:opacity-50"
              >
                {busy === "variants" ? "產生中…" : "AI 多版本"}
              </button>
              <button
                disabled={!!busy}
                onClick={() => call("save-as-material")}
                title="把這篇的文案＋媒體（主文／留言指派一起）存回素材庫，之後可重排"
                className="rounded border px-3 py-1 text-xs hover:bg-surface-2 disabled:opacity-50"
              >
                {busy === "save-as-material" ? "存中…" : "存成素材"}
              </button>
              <button disabled={!!busy} onClick={() => call("reject")} className="rounded border px-3 py-1 text-xs text-ink-2 hover:bg-surface-2">
                退回
              </button>
              <button
                disabled={!!busy}
                onClick={() => {
                  if (confirm("確定刪除這則草稿？此動作無法復原。")) call("delete");
                }}
                className="rounded border border-red-200 px-3 py-1 text-xs text-red-500 hover:bg-red-50"
              >
                刪除
              </button>
            </>
          )}
        </div>
      )}

      {/* 已發布／已退回：仍可把這篇存回素材庫，方便日後重排（媒體依主文／留言一起帶回） */}
      {done && !editing && (
        <div className="mt-2 border-t pt-2">
          <button
            disabled={!!busy}
            onClick={() => call("save-as-material")}
            title="把這篇的文案＋媒體（主文／留言指派一起）存回素材庫，之後可重排"
            className="rounded border px-3 py-1 text-xs hover:bg-surface-2 disabled:opacity-50"
          >
            {busy === "save-as-material" ? "存中…" : "存成素材"}
          </button>
        </div>
      )}

      {/* A/B 文案：多版本預覽，挑一個套用（寫回正文／留言，狀態不變） */}
      {variants && !editing && (
        <div className="mt-3 space-y-2 border-t pt-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-ink-2">AI 多版本（挑一個套用）</span>
            <button onClick={() => setVariants(null)} className="text-xs text-ink-3 hover:text-ink-2">
              收起
            </button>
          </div>
          {variants.map((v, i) => (
            <div key={i} className="rounded border bg-surface-2 p-2 text-xs">
              <p className="whitespace-pre-wrap text-ink">{v.mainText}</p>
              {v.replyText && <p className="mt-1 whitespace-pre-wrap text-ink-3">留言：{v.replyText}</p>}
              <button
                disabled={!!busy}
                onClick={() => {
                  setVariants(null);
                  call("edit", { main_text: v.mainText, reply_text: v.replyText });
                }}
                className="mt-1.5 rounded bg-brand px-2.5 py-1 text-white hover:opacity-90 disabled:opacity-50"
              >
                套用版本 {i + 1}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 佇列中草稿可改排程時間（手動微調發布時段）：做成明顯小區塊，不埋在卡片最底 */}
      {draft.status === "approved" && draft.scheduled_at && !editing && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 p-2 text-xs text-ink-2">
          <label htmlFor={`sched-${draft.id}`} className="font-medium">📅 發布時間：</label>
          <input
            id={`sched-${draft.id}`}
            type="datetime-local"
            className="rounded border px-2 py-1"
            value={schedTime}
            onChange={(e) => setSchedTime(e.target.value)}
            disabled={!!busy}
          />
          <button
            disabled={!!busy || !schedTime || schedTime === toLocalInput(draft.scheduled_at)}
            onClick={() => {
              const t = new Date(schedTime);
              if (Number.isNaN(t.getTime())) return setMsg("時間格式錯誤");
              call("reschedule", { scheduled_at: t.toISOString() });
            }}
            className="rounded border px-3 py-1 text-brand hover:bg-orange-50 disabled:opacity-50"
          >
            {busy === "reschedule" ? "改中…" : "改時間"}
          </button>
        </div>
      )}

      {draft.status === "failed" && draft.error && (
        <p className="mt-2 rounded bg-red-50 p-2 text-xs text-red-600">發布失敗：{draft.error}</p>
      )}

      {draft.status === "needs_verification" && !editing && (
        <div className="mt-2 rounded border border-orange-300 bg-orange-50 p-2 text-xs text-orange-800" role="alert">
          <p className="font-medium">⚠️ 發布狀態待確認</p>
          <p className="mt-1">{draft.error ?? "發文中途中斷，可能已發出。"}請先到該 Threads 帳號確認是否已發布，再選擇下方動作（避免重複發文被降觸及／封號）。</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              disabled={!!busy}
              onClick={() => {
                if (confirm("確認該貼文「沒有」發出、要重新發布？")) call("retry");
              }}
              className="rounded border border-amber-300 px-3 py-1 text-amber-700 hover:bg-amber-100 disabled:opacity-50"
            >
              {busy === "retry" ? "重排中…" : "沒發出 → 重發"}
            </button>
            <button
              disabled={!!busy}
              onClick={() => {
                if (confirm("確認該貼文「已經」發出、把這張草稿退回（不再重發）？")) call("reject");
              }}
              className="rounded border px-3 py-1 text-ink-2 hover:bg-surface-2 disabled:opacity-50"
            >
              {busy === "reject" ? "處理中…" : "已發出 → 退回"}
            </button>
          </div>
        </div>
      )}

      {showReply && rs === "pending" && (
        <p className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-700">🕒 留言補發排隊中（預計 {fmtEta(draft.reply_due_at)}）</p>
      )}
      {showReply && rs === "publishing-reply" && (
        <p className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-700">⏳ 留言補發中…</p>
      )}
      {showReply && rs === "published" && (
        <p className="mt-2 rounded bg-emerald-50 p-2 text-xs text-emerald-700">✅ 留言已補發</p>
      )}
      {showReply && rs === "failed" && (
        <div className="mt-2 rounded bg-red-50 p-2 text-xs text-red-600">
          <p>⚠️ 留言補發失敗{draft.error ? `：${draft.error}` : ""}</p>
          <button
            disabled={!!busy}
            onClick={() => call("retry-reply")}
            className="mt-1.5 rounded border border-amber-300 px-3 py-1 text-amber-700 hover:bg-amber-50 disabled:opacity-50"
          >
            {busy === "retry-reply" ? "重排中…" : "重試補留言"}
          </button>
        </div>
      )}
      {msg && <p className="mt-2 text-xs text-red-500">❌ {msg}</p>}
    </div>
  );
}

export default memo(DraftCard);
