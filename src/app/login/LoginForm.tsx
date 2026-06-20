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

  async function google() {
    setBusy(true);
    setMsg(null);
    const sb = getBrowserClient();
    const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    const { error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}` }
    });
    if (error) {
      setMsg(`❌ ${error.message}`);
      setBusy(false);
    }
    // 成功則瀏覽器會被導去 Google
  }

  async function run(mode: "in" | "up") {
    setBusy(true);
    setMsg(null);
    const sb = getBrowserClient();
    try {
      if (mode === "in") {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // 防 open redirect：只允許站內相對路徑（/ 開頭、非 //）
        const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
        router.push(safeNext);
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
      <button onClick={google} disabled={busy} className="btn btn-outline w-full">
        <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.3 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/>
          <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.3 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
          <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.2C29.2 35 26.7 36 24 36c-5.3 0-9.7-3.1-11.3-7.6l-6.5 5C9.6 39.6 16.2 44 24 44z"/>
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.6l6.3 5.2C41.8 35.6 44 30.3 44 24c0-1.3-.1-2.3-.4-3.5z"/>
        </svg>
        用 Google 登入
      </button>
      <div className="flex items-center gap-3 text-xs text-ink-3">
        <span className="h-px flex-1 bg-border" />或用 email<span className="h-px flex-1 bg-border" />
      </div>
      <input
        type="email"
        required
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="input"
      />
      <input
        type="password"
        required
        minLength={6}
        placeholder="密碼（至少 6 碼）"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="input"
      />
      <div className="flex items-center gap-2 pt-1">
        <button onClick={() => run("in")} disabled={busy} className="btn btn-brand flex-1">
          {busy ? "處理中…" : "登入"}
        </button>
        <button onClick={() => run("up")} disabled={busy} className="btn btn-outline">
          註冊
        </button>
      </div>
      {msg && <p className="text-sm text-ink-2">{msg}</p>}
    </div>
  );
}
