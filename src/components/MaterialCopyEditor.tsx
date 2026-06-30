"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import PostEditor, { type PostContent } from "@/components/PostEditor";
import { splitMaterialMedia, mergeToMaterialMedia } from "@/lib/material-media";
import type { Material } from "@/lib/types";

// 素材編輯器：與發文頁完全一致（共用 <PostEditor>）——主文／留言／多段串文 3/n+／各段媒體／
// AI 換句話說／即時預覽。存檔走 PATCH /api/materials/[id]（媒體依 slot 併回、多段存 thread_chain）。
function materialToContent(m: Material): PostContent {
  const split = splitMaterialMedia(m.media);
  return {
    mainText: m.main_text ?? "",
    replyText: m.reply_text ?? "",
    mainMedia: split.main,
    replyMedia: split.reply,
    extraSegments: Array.isArray(m.thread_chain) ? m.thread_chain : []
  };
}

export default function MaterialCopyEditor({
  material,
  accountLabel,
  cloud = null,
  preset = null,
  registerFlush
}: {
  material: Material;
  accountLabel?: string;
  cloud?: string | null;
  preset?: string | null;
  // 讓兄弟元件（再排一篇）在動作前先把編輯器內容存檔並收合，避免用到舊文案。未開啟時為 no-op。
  registerFlush?: (fn: (() => Promise<void>) | null) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState<PostContent>(() => materialToContent(material));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // flush 由父層在事件當下呼叫，需讀「最新」的 open／content（closure 會抓到舊值），故用 ref 同步。
  const openRef = useRef(open);
  openRef.current = open;
  const contentRef = useRef(content);
  contentRef.current = content;

  // 元件關閉時仍 mounted；父層 router.refresh() 帶回新 material 時同步（避免再次開啟看到舊內容）。
  // 編輯中（open）不覆蓋使用者輸入。
  useEffect(() => {
    if (!open) setContent(materialToContent(material));
  }, [material.main_text, material.reply_text, material.media, material.thread_chain, open]);

  // 自動存進度：邊打邊靜默 PATCH（不關閉編輯器、不 refresh）。失敗時 PostEditor 會顯示提示。
  async function autosave(c: PostContent, signal?: AbortSignal) {
    const res = await fetch(`/api/materials/${material.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        main_text: c.mainText,
        reply_text: c.replyText,
        media: mergeToMaterialMedia(c.mainMedia, c.replyMedia),
        thread_chain: c.extraSegments
      })
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) throw new Error("autosave failed");
  }

  // 對外註冊「存檔並收合」：父層在「再排一篇」前呼叫，把剛生成/編輯的文案先落地再重排。
  // 未開啟＝no-op；存檔失敗則拋出，由父層中止重排（避免用到尚未存檔的舊文案）。
  useEffect(() => {
    if (!registerFlush) return;
    registerFlush(async () => {
      if (!openRef.current) return;
      await autosave(contentRef.current);
      setOpen(false);
      router.refresh();
    });
    return () => registerFlush(null);
    // 僅需在掛載/卸載時註冊一次；flush 內部以 ref 取最新狀態。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerFlush, material.id]);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/materials/${material.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          main_text: content.mainText,
          reply_text: content.replyText,
          // 主文／留言媒體併回素材統一清單（標 slot main/reply/both）；3/n+ 存 thread_chain。
          media: mergeToMaterialMedia(content.mainMedia, content.replyMedia),
          thread_chain: content.extraSegments
        })
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
      <button type="button" onClick={() => setOpen(true)} className="rounded border px-3 py-1 text-xs text-ink-2 hover:bg-surface-2">
        ✏️ 編輯文案
      </button>
    );
  }

  return (
    <div className="mt-2 w-full space-y-3 rounded-xl border bg-surface-2 p-3">
      <PostEditor
        value={content}
        onChange={setContent}
        cloud={cloud}
        preset={preset}
        accountLabel={accountLabel}
        threadContext={{ productName: material.product_name, affiliateLink: material.affiliate_short_link, sourceText: material.main_text }}
        onAutosave={autosave}
      />
      <div className="flex items-center gap-2">
        <button type="button" onClick={save} disabled={busy} className="rounded-xl bg-brand px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
          {busy ? "儲存中…" : "儲存"}
        </button>
        <button type="button" onClick={() => { setOpen(false); setContent(materialToContent(material)); }} disabled={busy} className="rounded-xl border px-3 py-1.5 text-sm hover:bg-surface">
          取消
        </button>
        {msg && <span className="text-xs text-ink-3">{msg}</span>}
      </div>
    </div>
  );
}
