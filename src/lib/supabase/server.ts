import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, isSupabaseConfigured } from "@/lib/env";

// 伺服器端 service-role client（繞過 RLS，只在 API route / worker 使用）。
let cached: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!cached) {
    cached = createClient(env.supabaseUrl, env.supabaseServiceKey, {
      auth: { persistSession: false }
    });
  }
  return cached;
}
