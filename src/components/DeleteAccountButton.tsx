"use client";

import { useState } from "react";

// 永久刪除帳號（危險操作）：需輸入「刪除」二字確認，避免誤觸。成功後導回登入頁。
export default function DeleteAccountButton() {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function doDelete() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmText })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      window.location.href = "/login";
    } catch (e) {
      setMsg(`刪除失敗：${e instanceof Error ? e.message : String(e)}`);
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50/40 p-4">
      <div className="mb-1 text-sm font-medium text-red-600">刪除帳號</div>
      <p className="mb-3 text-xs text-ink-2">
        永久刪除你的帳號與所有自有資料（草稿、素材、來源、發文與分潤帳號、設定、贊助文紀錄）。此動作無法復原。
        <br />
        ⚠️ 已發佈到 Threads 的貼文（含贊助文）<span className="font-medium">不會</span>被自動刪除（Threads 無提供刪文 API），如需移除請自行到 Threads 操作。
      </p>
      {!open ? (
        <button
          onClick={() => {
            setConfirmText("");
            setMsg(null);
            setOpen(true);
          }}
          className="rounded-xl border border-red-300 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
        >
          我要刪除帳號
        </button>
      ) : (
        <div className="space-y-2">
          <label className="block text-xs text-ink-2">
            請輸入「<span className="font-semibold">刪除</span>」以確認：
          </label>
          <input
            className="w-40 rounded-xl border px-3 py-2 text-sm"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="刪除"
            aria-label="輸入刪除以確認"
          />
          <div className="flex gap-2">
            <button
              onClick={doDelete}
              disabled={busy || confirmText.trim() !== "刪除"}
              className="rounded-xl bg-red-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? "刪除中…" : "永久刪除"}
            </button>
            <button
              onClick={() => {
                setOpen(false);
                setConfirmText("");
                setMsg(null);
              }}
              disabled={busy}
              className="rounded-xl border px-3 py-2 text-sm"
            >
              取消
            </button>
          </div>
        </div>
      )}
      {msg && <p className="mt-2 text-xs text-red-500">{msg}</p>}
    </div>
  );
}
