"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Draft } from "@/lib/types";
import { CharCount } from "@/components/ThreadsPreview";
import ThreadsPreview from "@/components/ThreadsPreview";
import { normalizeDraftMedia } from "@/lib/media";
import { checkThreadsContent, THREADS_MAX_HASHTAGS } from "@/lib/threads-content";

export default function DraftCard({
  draft,
  dupSimilarity,
  accountLabel
}: {
  draft: Draft;
  dupSimilarity?: number;
  accountLabel?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [mainText, setMainText] = useState(draft.main_text ?? "");
  const [replyText, setReplyText] = useState(draft.reply_text ?? "");
  const [msg, setMsg] = useState<string | null>(null);

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

  return (
    <div className="flex flex-col rounded-lg border bg-white p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-medium text-neutral-700">{draft.product_name ?? "（未知商品）"}</span>
        <span className="flex shrink-0 items-center gap-1">
          {accountLabel && (
            <span className="max-w-[8rem] truncate rounded bg-shopee/10 px-2 py-0.5 text-xs text-shopee" title={`發到 ${accountLabel}`}>
              @{accountLabel}
            </span>
          )}
          <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">{draft.status}</span>
        </span>
      </div>

      {editing ? (
        <div className="space-y-2">
          <textarea
            className="w-full rounded border px-2 py-1 text-sm"
            rows={3}
            value={mainText}
            onChange={(e) => setMainText(e.target.value)}
            placeholder="正文"
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
          />
          <div className="flex gap-2">
            <button
              disabled={busy === "edit"}
              onClick={() => call("edit", { main_text: mainText, reply_text: replyText })}
              className="rounded bg-shopee px-3 py-1 text-xs text-white disabled:opacity-50"
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
        className="mt-2 truncate text-xs text-shopee hover:underline"
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

      {!done && !editing && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            disabled={!!busy}
            onClick={() => call("publish")}
            className="rounded bg-shopee px-3 py-1 text-xs text-white hover:opacity-90 disabled:opacity-50"
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
          <button disabled={!!busy} onClick={() => setEditing(true)} className="rounded border px-3 py-1 text-xs hover:bg-neutral-50">
            編輯
          </button>
          <button
            disabled={!!busy}
            onClick={() => call("regenerate")}
            className="rounded border px-3 py-1 text-xs hover:bg-neutral-50 disabled:opacity-50"
          >
            {busy === "regenerate" ? "重寫中…" : "AI 重寫"}
          </button>
          <button disabled={!!busy} onClick={() => call("reject")} className="rounded border px-3 py-1 text-xs text-neutral-500 hover:bg-neutral-50">
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

      {/* 佇列中草稿可改排程時間（手動微調發布時段） */}
      {draft.status === "approved" && draft.scheduled_at && !editing && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t pt-2 text-xs text-neutral-500">
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
            className="rounded border px-3 py-1 text-shopee hover:bg-orange-50 disabled:opacity-50"
          >
            {busy === "reschedule" ? "改中…" : "改時間"}
          </button>
        </div>
      )}

      {draft.status === "failed" && draft.error && (
        <p className="mt-2 rounded bg-red-50 p-2 text-xs text-red-600">發布失敗：{draft.error}</p>
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
