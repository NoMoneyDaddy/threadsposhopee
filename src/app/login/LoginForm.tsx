"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase/browser";

export default function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run(mode: "in" | "up") {
    setBusy(true);
    setMsg(null);
    const sb = getBrowserClient();
    try {
      if (mode === "in") {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push(next || "/");
        router.refresh();
      } else {
        const { error } = await sb.auth.signUp({ email, password });
        if (error) throw error;
        setMsg("✅ 註冊完成。若有開啟信箱驗證請先收信，否則可直接登入。");
      }
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <input
        type="email"
        required
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded-md border px-3 py-2 text-sm"
      />
      <input
        type="password"
        required
        minLength={6}
        placeholder="密碼（至少 6 碼）"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full rounded-md border px-3 py-2 text-sm"
      />
      <div className="flex items-center gap-2">
        <button
          onClick={() => run("in")}
          disabled={busy}
          className="rounded-md bg-shopee px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "處理中…" : "登入"}
        </button>
        <button
          onClick={() => run("up")}
          disabled={busy}
          className="rounded-md border px-4 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
        >
          註冊
        </button>
      </div>
      {msg && <p className="text-sm text-neutral-600">{msg}</p>}
    </div>
  );
}
