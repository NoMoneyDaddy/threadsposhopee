"use client";

import { useState, useEffect, memo } from "react";
import { useRouter } from "next/navigation";
import type { Draft } from "@/lib/types";
import { CharCount } from "@/components/ThreadsPreview";
import ThreadsPreview from "@/components/ThreadsPreview";
import { normalizeDraftMedia } from "@/lib/media";
import { checkThreadsContent, THREADS_MAX_HASHTAGS } from "@/lib/threads-content";

// memo：草稿列表（最多 100 張）在搜尋/篩選 re-render 時，只重繪 props 變動的卡片。
// 需搭配 DraftsExplorer 以 useCallback 穩定 onToggleSelect，否則 memo 失效。
function DraftCard({
  draft,
  dupSimilarity,
  accountLabel,
  sponsorEnabled = false,
  isSponsorPick = false,
  selectable = false,
  selected = false,
  onToggleSelect
}: {
  draft: Draft;
  dupSimilarity?: number;
  accountLabel?: string;
  sponsorEnabled?: boolean;
  isSponsorPick?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [mainText, setMainText] = useState(draft.main_text ?? "");
  const [replyText, setReplyText] = useState(draft.reply_text ?? "");
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

  // 父層資料（router.refresh / 背景更新）變動時同步本地狀態
  useEffect(() => {
    setMainText(draft.main_text ?? "");
    setReplyText(draft.reply_text ?? "");
    setSchedTime(toLocalInput(draft.scheduled_at));
  }, [draft.main_text, draft.reply_text, draft.scheduled_at]);

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
      if ((action === "regenerate" || action === "edit") && json.draft) {
        setMainText(json.draft.main_text ?? "");
        setReplyText(json.draft.reply_text ?? "");
      }
      if (action === "edit") setEditing(false);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const done = draft.status === "published" || draft.status === "rejected";

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
          {accountLabel && (
            <span className="max-w-[8rem] truncate rounded bg-brand/10 px-2 py-0.5 text-xs text-brand" title={`發到 ${accountLabel}`}>
              @{accountLabel}
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
          <textarea
            className="w-full rounded border px-2 py-1 text-sm"
            rows={3}
            value={mainText}
            onChange={(e) => setMainText(e.target.value)}
            placeholder="正文"
            aria-label="正文"
          />
          <div className="-mt-1 flex justify-end">
            <CharCount text={mainText} limit={500} />
          </div>
          <textarea
            className="w-full rounded border px-2 py-1 text-xs"
            rows={2}
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="留言區（含分潤連結）"
            aria-label="留言區（含分潤連結）"
          />
          <div className="flex gap-2">
            <button
              disabled={busy === "edit"}
              onClick={() => call("edit", { main_text: mainText, reply_text: replyText })}
              className="rounded bg-brand px-3 py-1 text-xs text-white disabled:opacity-50"
            >
              {busy === "edit" ? "儲存中…" : "儲存"}
            </button>
            <button onClick={() => setEditing(false)} className="rounded border px-3 py-1 text-xs">
              取消
            </button>
          </div>
        </div>
      ) : (
        // 預覽素材：仿 Threads 版面呈現正文／媒體（圖或影片）／留言區分潤連結
        <ThreadsPreview
          accountLabel={draft.product_name ?? undefined}
          mainText={mainText}
          replyText={replyText}
          mediaUrl={draft.cloudinary_media_url}
          mediaType={draft.media_type}
          media={normalizeDraftMedia(draft)}
        />
      )}

      <a
        href={draft.shopee_short_link ?? "#"}
        target="_blank"
        rel="noreferrer"
        className="mt-2 truncate text-xs text-brand hover:underline"
      >
        {draft.shopee_short_link}
      </a>

      {typeof dupSimilarity === "number" && (
        <div className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-700" role="alert">
          ⚠️ 文案與同帳號近期貼文高度相似（{Math.round(dupSimilarity * 100)}%），重複措辭易被降觸及，建議改寫再發。
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
          <button disabled={!!busy} onClick={() => setEditing(true)} className="rounded border px-3 py-1 text-xs hover:bg-surface-2">
            編輯
          </button>
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
          <button disabled={!!busy} onClick={() => call("reject")} className="rounded border px-3 py-1 text-xs text-ink-2 hover:bg-surface-2">
            退回
          </button>
          <button
            disabled={!!busy}
            onClick={() => {
              if (confirm("確定刪除這則草稿？")) call("delete");
            }}
            className="rounded border border-red-200 px-3 py-1 text-xs text-red-500 hover:bg-red-50"
          >
            刪除
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

      {/* 佇列中草稿可改排程時間（手動微調發布時段） */}
      {draft.status === "approved" && draft.scheduled_at && !editing && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t pt-2 text-xs text-ink-2">
          <label htmlFor={`sched-${draft.id}`}>排程：</label>
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
