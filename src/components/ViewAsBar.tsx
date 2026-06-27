"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";

type UserRow = { id: string; email: string | null };

// 管理者限定的頂部列：切換「以某成員視角檢視」（唯讀），或顯示目前檢視中的成員＋結束。
// 僅在 isPlatformOwner 時由 layout 渲染；/r 中轉頁不顯示。
export default function ViewAsBar({ viewingAsEmail }: { viewingAsEmail: string | null }) {
  const pathname = usePathname() ?? "";
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (pathname.startsWith("/r/")) return null;

  async function loadUsers() {
    if (users || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/users");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setUsers(json.users as UserRow[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "讀取失敗");
    } finally {
      setBusy(false);
    }
  }

  async function switchTo(id: string) {
    if (!id) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/view-as", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: id })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      window.location.href = "/"; // 重載以新身分（cookie httpOnly，需 server 重渲染）
    } catch (e) {
      setErr(e instanceof Error ? e.message : "切換失敗");
      setBusy(false);
    }
  }

  async function exit() {
    setBusy(true);
    try {
      await fetch("/api/admin/view-as", { method: "DELETE" });
    } finally {
      window.location.href = "/";
    }
  }

  // 檢視中：橘色橫幅＋結束鈕。
  if (viewingAsEmail) {
    return (
      <div className="flex flex-wrap items-center justify-center gap-2 bg-amber-500 px-4 py-1.5 text-center text-xs font-medium text-white">
        <span>👁 正在以成員視角檢視（唯讀）：{viewingAsEmail}</span>
        <button onClick={exit} disabled={busy} className="rounded-full bg-black/20 px-3 py-0.5 hover:bg-black/30 disabled:opacity-50">
          {busy ? "結束中…" : "結束檢視，回到管理者"}
        </button>
      </div>
    );
  }

  // 未檢視：細列＋下拉切換。
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-b border-border bg-surface-2 px-4 py-1 text-xs text-ink-3">
      <span className="mr-auto">管理者工具</span>
      <details className="relative" onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && loadUsers()}>
        <summary className="cursor-pointer select-none rounded px-2 py-0.5 hover:bg-surface hover:text-ink">
          切換成員視角（唯讀）
        </summary>
        <div className="absolute right-4 z-50 mt-1 w-72 rounded-xl border bg-surface p-2 shadow-[var(--shadow-card)]">
          {busy && !users ? (
            <div className="px-2 py-1 text-ink-3">載入中…</div>
          ) : err ? (
            <div className="px-2 py-1 text-danger">{err}</div>
          ) : users && users.length === 0 ? (
            <div className="px-2 py-1 text-ink-3">目前沒有其他成員可檢視</div>
          ) : (
            <select
              className="w-full rounded-lg border px-2 py-1.5 text-sm text-ink"
              defaultValue=""
              disabled={busy}
              onChange={(e) => switchTo(e.target.value)}
              aria-label="選擇要檢視的成員"
            >
              <option value="" disabled>
                選擇成員…（{users?.length ?? 0}）
              </option>
              {users?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.email ?? u.id}
                </option>
              ))}
            </select>
          )}
        </div>
      </details>
    </div>
  );
}
