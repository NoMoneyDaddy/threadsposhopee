"use client";

import { useState } from "react";

// 管理員賦予身份組：依 email 找使用者，勾選身份組後送出（覆寫式）。
export default function RoleGrantForm() {
  const [email, setEmail] = useState("");
  const [reviewer, setReviewer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const roles = reviewer ? ["reviewer"] : [];
      const res = await fetch("/api/admin/role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), roles })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setMsg(`✅ 已設定 ${email.trim()} 的身份組：${roles.length ? roles.join("、") : "（無）"}`);
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-3 p-4">
      <h2 className="text-lg font-semibold">賦予身份組</h2>
      <p className="text-sm text-ink-2">輸入會員 email，勾選要給的身份組（未勾選＝移除）。</p>
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="member@example.com"
        className="input"
      />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={reviewer} onChange={(e) => setReviewer(e.target.checked)} className="h-4 w-4 accent-brand" />
        🛡️ 審查員（可下架／恢復共享素材）
      </label>
      <button type="submit" disabled={busy} className="btn btn-brand btn-sm">
        {busy ? "處理中…" : "套用"}
      </button>
      {msg && <div className="text-xs text-ink-2">{msg}</div>}
    </form>
  );
}
