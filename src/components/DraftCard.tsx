"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Draft } from "@/lib/types";

export default function DraftCard({ draft }: { draft: Draft }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [mainText, setMainText] = useState(draft.main_text ?? "");
  const [replyText, setReplyText] = useState(draft.reply_text ?? "");
  const [msg, setMsg] = useState<string | null>(null);

  // 父層資料（router.refresh / 背景更新）變動時同步本地狀態
  useEffect(() => {
    setMainText(draft.main_text ?? "");
    setReplyText(draft.reply_text ?? "");
  }, [draft.main_text, draft.reply_text]);

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

  return (
    <div className="flex flex-col rounded-lg border bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-700">{draft.product_name ?? "（未知商品）"}</span>
        <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">{draft.status}</span>
      </div>

      {draft.cloudinary_media_url && draft.media_type !== "none" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={draft.cloudinary_media_url} alt="" className="mb-3 h-40 w-full rounded object-cover" />
      )}

      {editing ? (
        <div className="space-y-2">
          <textarea
            className="w-full rounded border px-2 py-1 text-sm"
            rows={3}
            value={mainText}
            onChange={(e) => setMainText(e.target.value)}
            placeholder="正文"
          />
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
        <>
          <div className="whitespace-pre-wrap text-sm text-neutral-800">{mainText}</div>
          <div className="mt-2 rounded bg-neutral-50 p-2 text-xs text-neutral-500 whitespace-pre-wrap">💬 {replyText}</div>
        </>
      )}

      <a
        href={draft.shopee_short_link ?? "#"}
        target="_blank"
        rel="noreferrer"
        className="mt-2 truncate text-xs text-shopee hover:underline"
      >
        {draft.shopee_short_link}
      </a>

      {!done && !editing && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            disabled={!!busy}
            onClick={() => call("publish")}
            className="rounded bg-shopee px-3 py-1 text-xs text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy === "publish" ? "發布中…" : "核准並發布"}
          </button>
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
      {msg && <p className="mt-2 text-xs text-red-500">❌ {msg}</p>}
    </div>
  );
}
