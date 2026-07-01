// 輕量請求限流：以 app_state 固定視窗計數（原子 RPC increment_app_state_int）。
// 無 Redis 也可用；跨 serverless 實例共享（存 DB）。demo 模式一律放行。
// 用途：公開 beacon（/r 點擊回報、telegram webhook）防灌水；寫入/批次端點防單租戶壓垮共享資源。
import { getServiceClient } from "./supabase/server";
import { isDemoMode } from "./env";

// 取用戶端 IP（x-forwarded-for 第一跳；無則 unknown）。純函式。
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

export interface RateLimitResult {
  ok: boolean;
  retryAfterSec: number;
}

// 固定視窗限流：同一 (bucket,id) 在 windowMs 內最多 limit 次。超過回 ok:false + 建議重試秒數。
// 失敗（DB 異常）採「放行」降級——限流是縱深防禦，不應因其故障擋掉正常請求。
export async function rateLimit(bucket: string, id: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  if (isDemoMode || limit <= 0 || windowMs <= 0) return { ok: true, retryAfterSec: 0 };
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs);
  const key = `rl:${bucket}:${id}:${windowStart}`;
  try {
    const sb = getServiceClient()!;
    const { data, error } = await sb.rpc("increment_app_state_int", { p_key: key, p_delta: 1 });
    if (error) return { ok: true, retryAfterSec: 0 }; // 降級放行
    const count = typeof data === "number" ? data : 0;
    if (count > limit) {
      const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now % windowMs)) / 1000));
      return { ok: false, retryAfterSec };
    }
    return { ok: true, retryAfterSec: 0 };
  } catch {
    return { ok: true, retryAfterSec: 0 }; // 降級放行
  }
}

// 標準 429 回應（含 Retry-After）。
export function tooManyRequests(retryAfterSec: number): Response {
  return new Response(JSON.stringify({ ok: false, error: "請求過於頻繁，請稍後再試" }), {
    status: 429,
    headers: { "content-type": "application/json", "retry-after": String(retryAfterSec) }
  });
}

// 每日清理 rl:* 視窗計數（視窗多為分鐘級，隔日全數過期，直接清）。
export async function cleanupRateLimitKeys(): Promise<{ deleted: number }> {
  if (isDemoMode) return { deleted: 0 };
  const sb = getServiceClient()!;
  const PAGE = 1000;
  let deleted = 0;
  for (;;) {
    const { data, error } = await sb.from("app_state").select("key").like("key", "rl:%").limit(PAGE);
    if (error) throw new Error(`掃描限流鍵失敗：${error.message}`);
    const keys = (data ?? []).map((r) => r.key as string);
    if (keys.length === 0) break;
    const { error: delErr } = await sb.from("app_state").delete().in("key", keys);
    if (delErr) throw new Error(`清理限流鍵失敗：${delErr.message}`);
    deleted += keys.length;
    if (keys.length < PAGE) break;
  }
  return { deleted };
}
