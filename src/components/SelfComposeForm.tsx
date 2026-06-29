"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ThreadsAccount } from "@/lib/types";
import PostEditor, { emptyPostContent, type PostContent, THREADS_LIMIT, MAX_EXTRA_SEGMENTS } from "@/components/PostEditor";
import { fetchWithTimeout } from "@/lib/http";
import { parseTaipeiDateTimeLocal } from "@/lib/datetime";

// 發文頁草稿暫存 key：發文沒有後端 id，故自動存進 localStorage（重整／關頁可救回未送出內容）。
const COMPOSE_DRAFT_KEY = "compose:draft";
const isNonEmptyContent = (c: PostContent) =>
  Boolean(c.mainText.trim() || c.replyText.trim() || c.mainMedia.length || c.replyMedia.length || c.extraSegments.length);

// 發文：像 Threads 一樣直接打字、上傳多張照片／影片，右側即時預覽；正文裡的蝦皮連結發布時自動轉成你的分潤連結。
// 編輯區共用 <PostEditor>（與草稿/素材一致）；本元件負責發文帳號、排程與送出（發布/排程/佇列/草稿）。
export default function SelfComposeForm({
  threadsAccounts,
  cloud = null,
  preset = null
}: {
  threadsAccounts: ThreadsAccount[];
  cloud?: string | null;
  preset?: string | null;
}) {
  const router = useRouter();
  const [content, setContent] = useState<PostContent>(emptyPostContent());
  const [replyDelay, setReplyDelay] = useState(""); // 留言延遲（分），空=用全域預設
  const [accountId, setAccountId] = useState(threadsAccounts[0]?.id ?? "");
  const [scheduledAt, setScheduledAt] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // 掛載時救回上次未送出的內容（localStorage）；解析失敗或為空則忽略。
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COMPOSE_DRAFT_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<PostContent>;
      const restored: PostContent = { ...emptyPostContent(), ...saved };
      if (isNonEmptyContent(restored)) {
        setContent(restored);
        setMsg("↩️ 已救回上次未送出的內容");
      }
    } catch {
      /* 壞資料就忽略 */
    }
  }, []);

  // 自動存進度：邊打邊寫進 localStorage（發文頁無後端 id，故存本機）。
  async function autosave(c: PostContent) {
    if (isNonEmptyContent(c)) localStorage.setItem(COMPOSE_DRAFT_KEY, JSON.stringify(c));
    else localStorage.removeItem(COMPOSE_DRAFT_KEY);
  }

  // 送出條件：正文必填＋至少一個發文帳號（與後端／submit 驗證一致）。
  const blockReason = threadsAccounts.length === 0 ? "請先到帳號管理綁定 Threads 帳號" : !content.mainText.trim() ? "請先輸入正文" : "";
  const canSubmit = blockReason === "";

  async function submit(action: "publish" | "schedule" | "draft" | "queue") {
    const { mainText, replyText, mainMedia, replyMedia, extraSegments } = content;
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
      if (extraSegments.some((s) => [...(s.text ?? "")].length > THREADS_LIMIT)) {
        setMsg(`有串文段落超過 ${THREADS_LIMIT} 字上限，請先精簡`);
        return;
      }
    }
    // 串文段落須有內容（文字或媒體），避免送出空段落
    if (extraSegments.some((s) => !(s.text && s.text.trim()) && (s.media ?? []).length === 0)) {
      setMsg("有空白的串文段落，請填入內容或移除");
      return;
    }
    if (extraSegments.length > MAX_EXTRA_SEGMENTS) {
      setMsg(`串文段落最多 ${MAX_EXTRA_SEGMENTS} 段`);
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
            media: mainMedia,
            reply_media: replyMedia,
            thread_chain: extraSegments,
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
      setContent(emptyPostContent());
      setReplyDelay("");
      localStorage.removeItem(COMPOSE_DRAFT_KEY);
      router.refresh();
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border bg-surface p-4">
      <PostEditor
        value={content}
        onChange={setContent}
        cloud={cloud}
        preset={preset}
        accountLabel={threadsAccounts.find((a) => a.id === (accountId || threadsAccounts[0]?.id))?.label}
        replyDelay={replyDelay}
        onReplyDelayChange={setReplyDelay}
        onAutosave={autosave}
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
        <button
          onClick={() => submit("queue")}
          disabled={!!busy || !canSubmit}
          title={blockReason || "自動排進下一個還沒排滿的發文時段，並依防封節奏拉開間隔"}
          className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy === "queue" ? "排入中…" : "加入佇列"}
        </button>
        <button
          onClick={() => submit("publish")}
          disabled={!!busy || !canSubmit}
          title={blockReason || "不排隊，現在就把這篇發出去"}
          className="rounded-xl border border-brand/40 px-4 py-2 text-sm text-brand hover:bg-orange-50 disabled:opacity-50"
        >
          {busy === "publish" ? "發布中…" : "立即發布"}
        </button>
        <button onClick={() => submit("schedule")} disabled={!!busy || !canSubmit} title={blockReason || undefined} className="rounded-xl border px-4 py-2 text-sm hover:bg-surface-2 disabled:opacity-50">
          指定時間
        </button>
        <button onClick={() => submit("draft")} disabled={!!busy || !canSubmit} title={blockReason || undefined} className="rounded-xl border px-4 py-2 text-sm hover:bg-surface-2 disabled:opacity-50">
          存草稿
        </button>
      </div>

      {!busy && blockReason && <p className="text-sm text-amber-600" role="status" aria-live="polite">{blockReason}</p>}
      {msg && <p className="text-sm text-ink-2" role="status" aria-live="polite">{msg}</p>}
    </div>
  );
}
