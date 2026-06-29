"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase/browser";

// 維持登入 session 不中斷。
// 問題：之前正常頁面不建立瀏覽器端 Supabase client，登入只靠 cookie 的 access token（約 1 小時）＋
// middleware 在 server 端用 refresh token 換新。手機切到別的 App 再回來時，會同時觸發多個請求，
// 各自拿同一個「一次性輪替」的 refresh token 去刷新 → 只有一個成功、其餘失敗 → session 被判失效 → 被導去登入（看起來像「斷線」）。
//
// 解法：掛一個瀏覽器端 client。@supabase/ssr 的 createBrowserClient 會：
// (1) 在 token 過期前自動刷新、(2) 回到前景（visibilitychange）時刷新、(3) 用 navigator.locks 跨分頁序列化刷新（避免並發打架），
// 並把新 session 寫回 cookie。token 刷新／登入登出時 router.refresh()，讓 server component 取得新 cookie。
export default function SessionSync() {
  const router = useRouter();
  useEffect(() => {
    // Demo 模式（未設 Supabase env）不建立 client，避免用 undefined 金鑰初始化。
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return;
    const supabase = getBrowserClient();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      // 只在 token 刷新／登入登出時同步 server（初次 INITIAL_SESSION 不刷新，避免無謂重繪）。
      if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN" || event === "SIGNED_OUT") {
        router.refresh();
      }
    });
    return () => data.subscription.unsubscribe();
  }, [router]);
  return null;
}
