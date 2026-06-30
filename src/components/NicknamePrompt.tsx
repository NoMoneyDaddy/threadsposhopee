"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const DISMISS_KEY = "nickname-prompt-dismissed";

// 首次登入提示：尚未設定會員暱稱時，於頂部顯示一次性橫幅，可直接輸入存檔或稍後再說。
// 「稍後再說」記在 localStorage，不再叨擾；存檔後暱稱已設，橫幅自然消失（由 layout 條件控制）。
export default function NicknamePrompt() {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 只在 client 端讀 localStorage，避免 SSR/hydration 不一致。
  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY) !== "1") setShow(true);
    } catch {
      setShow(true);
    }
  }, []);

  if (!show) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // localStorage 不可用（隱私模式）也無妨，僅本次關閉
    }
    setShow(false);
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/profile/display-name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setShow(false);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4 rounded-2xl border border-border bg-surface-2 p-4">
      <div className="mb-1 text-sm font-medium text-ink">👋 設定你的暱稱</div>
      <p className="mb-2 text-xs text-ink-2">
        取一個站內顯示用的暱稱（頂部列與貢獻排行榜會用它，取代 email）。也可到「設定」隨時修改。
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          className="input min-w-0 flex-1"
          maxLength={24}
          placeholder="例如：小明、海島選物"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
          }}
        />
        <button onClick={save} disabled={busy || !name.trim()} className="btn btn-brand shrink-0">
          {busy ? "儲存中…" : "儲存"}
        </button>
        <button onClick={dismiss} disabled={busy} className="btn btn-ghost btn-sm shrink-0">
          稍後再說
        </button>
      </div>
      {err && <p className="mt-2 text-xs text-red-500">❌ {err}</p>}
    </div>
  );
}
