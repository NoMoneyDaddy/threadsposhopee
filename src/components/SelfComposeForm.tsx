"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ThreadsAccount } from "@/lib/types";
import ThreadsPreview, { CharCount } from "@/components/ThreadsPreview";
import { fetchWithTimeout } from "@/lib/http";
import { parseTaipeiDateTimeLocal } from "@/lib/datetime";

const input = "w-full rounded-xl border px-3 py-2 text-sm";
const THREADS_LIMIT = 500;

// 自寫一則直推：不靠蝦皮連結／AI，直接打字發到 Threads（可選一張圖或影片網址）。
export default function SelfComposeForm({ threadsAccounts }: { threadsAccounts: ThreadsAccount[] }) {
  const router = useRouter();
  const [mainText, setMainText] = useState("");
  const [replyText, setReplyText] = useState("");
  const [replyDelay, setReplyDelay] = useState(""); // 留言延遲（分），空=用全域預設
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaType, setMediaType] = useState<"image" | "video">("image");
  const [accountId, setAccountId] = useState(threadsAccounts[0]?.id ?? "");
  const [scheduledAt, setScheduledAt] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(action: "publish" | "schedule" | "draft" | "queue") {
    if (!mainText.trim()) {
      setMsg("請先輸入正文");
      return;
    }
    // 正文與留言（＝串文 2/2）在 Threads 都有 500 字上限；非草稿先擋，避免發布時才失敗
    if (action !== "draft") {
      if ([...mainText].length > THREADS_LIMIT) {
        setMsg(`正文超過 ${THREADS_LIMIT} 字上限，請先精簡`);
        return;
      }
      if ([...replyText].length > THREADS_LIMIT) {
        setMsg(`留言區超過 ${THREADS_LIMIT} 字上限，請先精簡`);
        return;
      }
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
      const res = await fetchWithTimeout(
        "/api/compose",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            threads_account_id: targetAccountId,
            main_text: mainText,
            reply_text: replyText,
            reply_delay_minutes: replyDelay.trim() === "" ? null : Number(replyDelay),
            media_url: mediaUrl.trim() || null,
            media_type: mediaType,
            action,
            scheduled_at: scheduledAt ? parseTaipeiDateTimeLocal(scheduledAt).toISOString() : null
          })
        },
        30000
      );
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
      setMainText("");
      setReplyText("");
      setReplyDelay("");
      setMediaUrl("");
      router.refresh();
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border bg-surface p-4">
      <div>
        <label htmlFor="self-compose-main" className="mb-1 block text-sm font-medium text-ink">
          正文
        </label>
        <textarea
          id="self-compose-main"
          className={input}
          rows={3}
          value={mainText}
          onChange={(e) => setMainText(e.target.value)}
          placeholder="正文（直接打字）"
        />
        <div className="mt-1 flex justify-end">
          <CharCount text={mainText} limit={THREADS_LIMIT} />
        </div>
      </div>
      <div>
        <label htmlFor="self-compose-reply" className="mb-1 block text-sm font-medium text-ink">
          留言區（接續貼文 2/2，選填）
        </label>
        <textarea
          id="self-compose-reply"
          className={input + " text-xs"}
          rows={2}
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          placeholder="留言區（選填，例如分潤連結）"
        />
        {replyText.trim() && (
          <div className="mt-1 flex items-center gap-2">
            <label htmlFor="self-compose-reply-delay" className="text-xs text-ink-2">
              留言延遲（分，空＝用預設）
            </label>
            <input
              id="self-compose-reply-delay"
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
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={input + " flex-1"}
          value={mediaUrl}
          onChange={(e) => setMediaUrl(e.target.value)}
          placeholder="圖片／影片網址（選填）"
          inputMode="url"
          aria-label="媒體網址"
        />
        <select
          className="rounded-xl border px-2 py-2 text-sm"
          value={mediaType}
          onChange={(e) => setMediaType(e.target.value as "image" | "video")}
          aria-label="媒體類型"
        >
          <option value="image">圖片</option>
          <option value="video">影片</option>
        </select>
      </div>

      <ThreadsPreview
        accountLabel={threadsAccounts.find((a) => a.id === (accountId || threadsAccounts[0]?.id))?.label}
        mainText={mainText}
        replyText={replyText}
        mediaUrl={mediaUrl.trim() || null}
        mediaType={mediaUrl.trim() ? mediaType : "none"}
      />

      <div className="flex flex-wrap items-center gap-2">
        <select
          className="rounded-xl border px-2 py-2 text-sm"
          value={accountId || threadsAccounts[0]?.id || ""}
          onChange={(e) => setAccountId(e.target.value)}
          aria-label="發文帳號"
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
          title="排程時間（選「指定時間」時使用）"
          aria-label="排程時間"
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

      {msg && <p className="text-sm text-ink-2" role="status" aria-live="polite">{msg}</p>}
    </div>
  );
}
