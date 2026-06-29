"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ThreadsPreview, { CharCount } from "@/components/ThreadsPreview";
import { normalizeDraftMedia } from "@/lib/media";
import type { Material, DraftMedia } from "@/lib/types";

// 素材文案編輯器：與發文頁一致，左邊編輯主文／留言，右邊用 ThreadsPreview 即時預覽（所見即所得）。
// 媒體沿用素材既有的（依 slot 拆主文／留言）；只編輯文案，存檔走 PATCH /api/materials/[id]。
export default function MaterialCopyEditor({ material, accountLabel }: { material: Material; accountLabel?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mainText, setMainText] = useState(material.main_text ?? "");
  const [replyText, setReplyText] = useState(material.reply_text ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // 依 slot 拆主文／留言媒體供預覽（both 兩邊都帶；舊資料無 slot＝全主文）。
  const all = normalizeDraftMedia(material);
  const mainMedia: DraftMedia[] = all.filter((m) => !m.slot || m.slot === "main" || m.slot === "both");
  const replyMedia: DraftMedia[] = all.filter((m) => m.slot === "reply" || m.slot === "both");

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/materials/${material.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ main_text: mainText, reply_text: replyText })
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(typeof json?.error === "string" ? json.error : `儲存失敗（HTTP ${res.status}）`);
      setMsg("✅ 已儲存");
      setOpen(false);
      router.refresh();
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border px-3 py-1 text-xs text-ink-2 hover:bg-surface-2"
      >
        ✏️ 編輯文案
      </button>
    );
  }

  return (
    <div className="mt-2 w-full space-y-3 rounded-xl border bg-surface-2 p-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs text-ink-3">主文</label>
              <CharCount text={mainText} />
            </div>
            <textarea
              className="min-h-24 w-full rounded-lg border px-2 py-1.5 text-sm"
              value={mainText}
              onChange={(e) => setMainText(e.target.value)}
              placeholder="主文（1/n）…"
            />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs text-ink-3">留言（2/n，放分潤連結）</label>
              <CharCount text={replyText} />
            </div>
            <textarea
              className="min-h-20 w-full rounded-lg border px-2 py-1.5 text-sm"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="留言（2/n）…"
            />
          </div>
        </div>
        <ThreadsPreview
          accountLabel={accountLabel}
          mainText={mainText}
          replyText={replyText}
          media={mainMedia}
          replyMedia={replyMedia}
        />
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={save} disabled={busy} className="rounded-xl bg-brand px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
          {busy ? "儲存中…" : "儲存文案"}
        </button>
        <button type="button" onClick={() => { setOpen(false); setMainText(material.main_text ?? ""); setReplyText(material.reply_text ?? ""); }} disabled={busy} className="rounded-xl border px-3 py-1.5 text-sm hover:bg-surface">
          取消
        </button>
        {msg && <span className="text-xs text-ink-3">{msg}</span>}
      </div>
    </div>
  );
}
