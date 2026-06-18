import { createBrowserClient } from "@supabase/ssr";

// 瀏覽器端 client（client component 用）。只用 NEXT_PUBLIC_* 變數，避免引入 next/headers。
export function getBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
