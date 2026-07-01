"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// 新素材是否預設分享到共享庫（不含分潤連結）。預設開；關閉後新素材預設不分享（仍可逐筆手動分享）。
export default function DefaultShareForm({ initial }: { initial: boolean }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function toggle(next: boolean) {
    setBusy(true);
    setMsg(null);
    const prev = enabled;
    setEnabled(next);
    try {
      const res = await fetch("/api/accounts/default-share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setMsg(next ? "✅ 新素材將預設分享" : "✅ 新素材將預設不分享");
      router.refresh();
    } catch (e) {
      setEnabled(prev);
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-4">
      <div className="mb-1 font-medium">新素材預設分享到共享庫</div>
      <p className="mb-2 text-xs text-ink-2">
        開啟（預設）：之後<b>手動建立</b>或<b>核准入庫</b>的素材會自動分享到共享庫，讓大家用自己的金鑰匯入
        （<b>只分享商品名／圖／文案／原始連結，不含你的分潤連結</b>）；被匯入越多、貢獻越高。
        關閉則新素材預設不分享（仍可到素材卡逐筆分享）。<b>只影響之後新增，既有素材不變。</b>
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} disabled={busy} onChange={(e) => toggle(e.target.checked)} />
        新素材自動分享到共享庫
      </label>
      {msg && <p className="mt-1 text-sm text-ink-2" role="status" aria-live="polite">{msg}</p>}
    </div>
  );
}
