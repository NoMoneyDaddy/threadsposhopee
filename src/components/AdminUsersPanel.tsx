"use client";

import { useState } from "react";
import type { UserOverviewRow } from "@/lib/store";

// 管理頁使用者總覽（owner 限定）：列出所有使用者的身份組與綁定帳號數，並可一鍵「以該成員視角檢視」。
// 身份組的賦予/取消仍在上方 RoleGrantForm；本面板著重總覽與快速切換視角。
export default function AdminUsersPanel({ users }: { users: UserOverviewRow[] }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function viewAs(id: string) {
    setBusyId(id);
    setErr(null);
    try {
      const res = await fetch("/api/admin/view-as", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: id })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      window.location.href = "/"; // 以新身分重載（view-as cookie 為 httpOnly，需 server 重渲染）
    } catch (e) {
      setErr(e instanceof Error ? e.message : "切換失敗");
      setBusyId(null);
    }
  }

  return (
    <div className="card p-4">
      <h2 className="mb-1 text-lg font-semibold">使用者管理</h2>
      <p className="mb-3 text-sm text-ink-2">全部使用者的身份組與綁定帳號數。可「以成員視角檢視」（唯讀）排查問題。</p>
      {err && <div className="mb-2 text-sm text-red-600">❌ {err}</div>}
      {users.length === 0 ? (
        <p className="text-sm text-ink-3">尚無其他使用者。</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-ink-3">
                <th className="py-1.5 pr-2 font-medium">使用者</th>
                <th className="py-1.5 pr-2 font-medium">身份組</th>
                <th className="py-1.5 pr-2 font-medium tabular-nums">Threads</th>
                <th className="py-1.5 pr-2 font-medium">蝦皮</th>
                <th className="py-1.5 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="py-2 pr-2">
                    <span className="break-all text-ink">{u.email ?? "（無 email）"}</span>
                  </td>
                  <td className="py-2 pr-2">
                    {u.roles.length === 0 ? (
                      <span className="text-ink-3">一般</span>
                    ) : (
                      u.roles.map((r) => (
                        <span key={r} className="mr-1 rounded-full bg-brand/10 px-2 py-0.5 text-xs text-brand">
                          {r === "reviewer" ? "審核者" : r}
                        </span>
                      ))
                    )}
                  </td>
                  <td className="py-2 pr-2 tabular-nums text-ink-2">{u.threadsCount}</td>
                  <td className="py-2 pr-2 text-ink-2">{u.shopeeBound ? "✅" : "—"}</td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => viewAs(u.id)}
                      disabled={busyId !== null}
                      className="rounded-xl border px-3 py-1 text-xs text-ink-2 hover:bg-surface-2 disabled:opacity-50"
                      title="以該成員視角檢視（唯讀）"
                    >
                      {busyId === u.id ? "切換中…" : "檢視"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
