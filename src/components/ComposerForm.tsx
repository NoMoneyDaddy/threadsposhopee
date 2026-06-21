"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ThreadsAccount, Material } from "@/lib/types";
import ThreadsPreview, { CharCount } from "@/components/ThreadsPreview";
import { checkThreadsContent, THREADS_MAX_HASHTAGS } from "@/lib/threads-content";
import { parseTaipeiDateTimeLocal } from "@/lib/datetime";
import { cloudinaryThumb } from "@/lib/img";

const input = "w-full rounded-xl border px-3 py-2 text-sm";
const THREADS_LIMIT = 500;

export default function ComposerForm({ threadsAccounts }: { threadsAccounts: ThreadsAccount[] }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [material, setMaterial] = useState<Material | null>(null);
  const [mainText, setMainText] = useState("");
  const [replyText, setReplyText] = useState("");
  const [replyDelay, setReplyDelay] = useState(""); // 留言延遲（分），空=用全域預設
  const [accountId, setAccountId] = useState(threadsAccounts[0]?.id ?? "");
  const [scheduledAt, setScheduledAt] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function generate() {
    if (!url.trim()) return;
    setBusy("gen");
    setMsg(null);
    try {
      const res = await fetch("/api/materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopee_url: url.trim(), generate_copy: true })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      const m: Material = json.material;
      setMaterial(m);
      setMainText(m.main_text ?? "");
      setReplyText(m.reply_text ?? "");
      setMsg(json.reused ? "已有素材，帶出（未重燒 token）" : "已產生文案，可編輯後發布");
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  async function submit(action: "publish" | "schedule" | "draft" | "queue") {
    if (!material) return;
    // 超過 Threads 500 字上限時，發布/排程會被 API 拒；存草稿仍允許讓使用者之後修
    if (action !== "draft" && [...mainText].length > THREADS_LIMIT) {
      setMsg(`正文超過 ${THREADS_LIMIT} 字上限，請先精簡`);
      return;
    }
    const targetAccountId = accountId || threadsAccounts[0]?.id;
    if (!targetAccountId) {
      setMsg("請先選擇發文帳號（或到帳號管理新增）");
      return;
    }
    if (action === "schedule") {
      if (!scheduledAt) {
        setMsg("請選擇排程時間");
        return;
      }
      const when = parseTaipeiDateTimeLocal(scheduledAt);
      if (Number.isNaN(when.getTime())) {
        setMsg("排程時間格式不正確");
        return;
      }
      if (when.getTime() <= Date.now()) {
        setMsg("排程時間必須是未來的時間");
        return;
      }
    }
    setBusy(action);
    setMsg(null);
    try {
      const res = await fetch("/api/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          material_id: material.id,
          threads_account_id: targetAccountId,
          main_text: mainText,
          reply_text: replyText,
          reply_delay_minutes: replyDelay.trim() === "" ? null : Number(replyDelay),
          action,
          scheduled_at: scheduledAt ? parseTaipeiDateTimeLocal(scheduledAt).toISOString() : null
        })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      const slotTxt = json.queuedSlot
        ? new Date(json.queuedSlot).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", dateStyle: "short", timeStyle: "short" })
        : "";
      const done =
        action === "publish"
          ? "✅ 已發布！"
          : action === "schedule"
            ? "✅ 已排程"
            : action === "queue"
              ? `✅ 已加入佇列（${slotTxt}）`
              : "✅ 已存草稿";
      setMsg(done);
      // 重置以便再發下一個
      setMaterial(null);
      setUrl("");
      setMainText("");
      setReplyText("");
      setReplyDelay("");
      router.refresh();
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* 步驟 1：貼連結 */}
      <div className="rounded-2xl border bg-surface p-4">
        <label className="mb-1 block text-sm font-medium">貼上蝦皮商品連結（或現成分潤連結）</label>
        <div className="flex gap-2">
          <input
            className={input}
            placeholder="https://s.shopee.tw/... 或 shopee.tw/product/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button
            onClick={generate}
            disabled={busy === "gen" || !url.trim()}
            className="shrink-0 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy === "gen" ? "產生中…" : "產生文案"}
          </button>
        </div>
      </div>

      {/* 步驟 2：預覽 + 編輯 + 送出 */}
      {material && (
        <div className="space-y-3 rounded-2xl border bg-surface p-4">
          <div className="flex items-center gap-3">
            {material.cloudinary_media_url && material.media_type === "image" && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cloudinaryThumb(material.cloudinary_media_url, 128)} alt="" loading="lazy" className="h-16 w-16 rounded object-cover" />
            )}
            {material.cloudinary_media_url && material.media_type === "video" && (
              <video src={material.cloudinary_media_url} className="h-16 w-16 rounded object-cover" controls />
            )}
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{material.product_name ?? "（商品）"}</div>
              <a
                href={material.affiliate_short_link ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="truncate text-xs text-brand hover:underline"
              >
                {material.affiliate_short_link}
              </a>
            </div>
          </div>

          <div>
            <textarea className={input} rows={3} value={mainText} onChange={(e) => setMainText(e.target.value)} placeholder="正文" />
            <div className="mt-1 flex items-center justify-end gap-2">
              {checkThreadsContent(mainText).tooManyHashtags && (
                <span role="status" aria-live="polite" className="mr-auto text-xs text-amber-600">
                  ⚠️ hashtag 過多（Threads 建議最多 {THREADS_MAX_HASHTAGS} 個）
                </span>
              )}
              <CharCount text={mainText} limit={THREADS_LIMIT} />
            </div>
          </div>
          <textarea
            className={input + " text-xs"}
            rows={2}
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="留言區（含分潤連結）"
          />
          {replyText.trim() && (
            <div className="flex items-center gap-2">
              <label htmlFor="composer-reply-delay" className="text-xs text-ink-2">
                留言延遲（分，空＝用預設）
              </label>
              <input
                id="composer-reply-delay"
                className="w-24 rounded-xl border px-2 py-1 text-xs"
                inputMode="numeric"
                placeholder="如 15"
                value={replyDelay}
                onChange={(e) => {
                  const v = e.target.value;
                  if (/^\d*$/.test(v) && (v === "" || Number(v) <= 1440)) setReplyDelay(v);
                }}
              />
            </div>
          )}

          <ThreadsPreview
            accountLabel={threadsAccounts.find((a) => a.id === (accountId || threadsAccounts[0]?.id))?.label}
            mainText={mainText}
            replyText={replyText}
            mediaUrl={material.cloudinary_media_url}
            mediaType={material.media_type}
          />

          <div className="flex flex-wrap items-center gap-2">
            <select
              className="rounded-xl border px-2 py-2 text-sm"
              value={accountId || threadsAccounts[0]?.id || ""}
              onChange={(e) => setAccountId(e.target.value)}
            >
              {threadsAccounts.length === 0 && <option value="">（尚無發文帳號）</option>}
              {threadsAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
            <input
              type="datetime-local"
              className="rounded-xl border px-2 py-2 text-sm"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              title="排程時間（選「排程發布」時使用）"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button onClick={() => submit("publish")} disabled={!!busy} className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {busy === "publish" ? "發布中…" : "立即發布"}
            </button>
            <button
              onClick={() => submit("queue")}
              disabled={!!busy}
              title="自動排進下一個空的每日發文時段"
              className="rounded-xl border border-brand/40 px-4 py-2 text-sm text-brand hover:bg-orange-50 disabled:opacity-50"
            >
              {busy === "queue" ? "排入中…" : "加入佇列"}
            </button>
            <button onClick={() => submit("schedule")} disabled={!!busy} className="rounded-xl border px-4 py-2 text-sm hover:bg-surface-2 disabled:opacity-50">
              指定時間
            </button>
            <button onClick={() => submit("draft")} disabled={!!busy} className="rounded-xl border px-4 py-2 text-sm hover:bg-surface-2 disabled:opacity-50">
              存草稿
            </button>
          </div>
        </div>
      )}

      {msg && <p className="text-sm text-ink-2">{msg}</p>}
    </div>
  );
}
