"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// 管理頁 Threads 帳號／Token 狀態總表（owner 限定）：
// 顯示每個發文帳號的擁有者、token 到期、發文狀態、斷路器冷卻；可手動解除斷路器。
// token 到期文案在 server 端算好傳入（避免 client Date.now() 造成 hydration 不一致）。
export default function AdminAccountsPanel({ accounts }: { accounts: AccountStatusView[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function clearCircuit(id: string) {
    setBusyId(id);
    setErr(null);
    try {
      const res = await fetch("/api/admin/clear-circuit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: id })
      });
      let json: { ok?: boolean; error?: string } | null = null;
      try {
        json = await res.json();
      } catch {
        /* 非 JSON 回應 */
      }
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? `解除失敗（HTTP ${res.status}）`);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "解除失敗");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="card p-4">
      <h2 className="mb-1 text-lg font-semibold">Threads 帳號 ＆ Token 狀態</h2>
      <p className="mb-3 text-sm text-ink-2">所有發文帳號的 token 到期、發文狀態與斷路器冷卻。可手動解除冷卻讓帳號下輪恢復嘗試。</p>
      {err && <div className="mb-2 text-sm text-red-600">❌ {err}</div>}
      {accounts.length === 0 ? (
        <p className="text-sm text-ink-3">尚無 Threads 發文帳號。</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-ink-3">
                <th className="py-1.5 pr-2 font-medium">帳號</th>
                <th className="py-1.5 pr-2 font-medium">擁有者</th>
                <th className="py-1.5 pr-2 font-medium">Token</th>
                <th className="py-1.5 pr-2 font-medium">狀態</th>
                <th className="py-1.5 font-medium">斷路器</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td className="py-2 pr-2">
                    <div className="text-ink">{a.label}</div>
                    <div className="text-xs text-ink-3">id: {a.threadsUserId}</div>
                  </td>
                  <td className="py-2 pr-2 break-all text-ink-2">{a.ownerEmail ?? "—"}</td>
                  <td className={`py-2 pr-2 ${a.token.tone}`}>{a.token.text}</td>
                  <td className="py-2 pr-2 text-ink-2">{a.status}</td>
                  <td className="py-2">
                    {a.circuitText ? (
                      <span className="flex items-center gap-2">
                        <span className="text-amber-600">{a.circuitText}</span>
                        <button
                          onClick={() => clearCircuit(a.id)}
                          disabled={busyId !== null}
                          className="rounded-xl border px-2 py-0.5 text-xs text-ink-2 hover:bg-surface-2 disabled:opacity-50"
                        >
                          {busyId === a.id ? "解除中…" : "解除"}
                        </button>
                      </span>
                    ) : (
                      <span className="text-ink-3">—</span>
                    )}
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

// server 端預先算好的顯示資料（避免 client 端時間計算造成 hydration 不一致）。
export interface AccountStatusView {
  id: string;
  label: string;
  ownerEmail: string | null;
  threadsUserId: string;
  status: string;
  token: { tone: string; text: string };
  circuitText: string | null;
}
