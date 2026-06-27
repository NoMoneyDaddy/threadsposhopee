// Telegram deeplink 綁定：使用者在網站按「一鍵綁定」→ 產一次性綁定碼 →
// 開 https://t.me/<bot>?start=<綁定碼> → 使用者按 START → Telegram 把 `/start <綁定碼>`
// 送進 webhook → 以綁定碼反查是哪位使用者 → 自動寫入其 chat_id，免手動複製貼上。
import { randomUUID } from "node:crypto";
import { getServiceClient } from "./supabase/server";
import { isDemoMode } from "./env";

// 綁定碼有效期（分鐘）：短時效降低外洩/側錄風險，且一次性消費。
const TTL_MINUTES = 10;
const KEY_PREFIX = "tgbind:";

// 綁定碼格式：32 位小寫 hex（randomUUID 去連字號）。符合 Telegram start payload 僅 A-Za-z0-9_- 且 ≤64 的限制。
export function isValidBindToken(s: string): boolean {
  return /^[0-9a-f]{32}$/.test(s);
}

// 從 Telegram 訊息文字解析 /start 後的 payload；無 payload 回 null。
// 例："/start abc123" → "abc123"；"/start" → null；"/start@bot xyz" → "xyz"（群組中指令會帶 @botname）。
export function parseStartPayload(text: string | undefined | null): string | null {
  if (typeof text !== "string") return null;
  const m = /^\/start(?:@\S+)?(?:\s+(\S+))?/.exec(text.trim());
  return m?.[1] ?? null;
}

// demo 模式用記憶體；key=綁定碼，value={ownerId, 到期 epoch ms}
const demoTokens = new Map<string, { ownerId: string; exp: number }>();

// 產生一次性綁定碼並存起來，回傳綁定碼。
export async function createBindToken(ownerId: string): Promise<string> {
  const token = randomUUID().replace(/-/g, "");
  const exp = Date.now() + TTL_MINUTES * 60_000;
  if (isDemoMode) {
    demoTokens.set(token, { ownerId, exp });
    return token;
  }
  const sb = getServiceClient()!;
  const { error } = await sb.from("app_state").upsert(
    { key: KEY_PREFIX + token, value: JSON.stringify({ ownerId, exp }), updated_at: new Date().toISOString() },
    { onConflict: "key" }
  );
  if (error) throw new Error(`建立 Telegram 綁定碼失敗：${error.message}`);
  return token;
}

// 消費綁定碼（一次性）：有效則刪除並回 ownerId；格式錯、不存在或已過期回 null。
export async function consumeBindToken(token: string): Promise<string | null> {
  if (!isValidBindToken(token)) return null;
  if (isDemoMode) {
    const rec = demoTokens.get(token);
    demoTokens.delete(token);
    return rec && rec.exp > Date.now() ? rec.ownerId : null;
  }
  const sb = getServiceClient()!;
  const key = KEY_PREFIX + token;
  const { data, error } = await sb.from("app_state").select("value").eq("key", key).maybeSingle();
  if (error) throw new Error(`讀取 Telegram 綁定碼失敗：${error.message}`);
  // 先刪除（一次性），再判斷有效性，避免重放。
  await sb.from("app_state").delete().eq("key", key);
  if (!data?.value) return null;
  try {
    const rec = JSON.parse(data.value) as { ownerId?: string; exp?: number };
    if (typeof rec.ownerId !== "string" || typeof rec.exp !== "number" || rec.exp <= Date.now()) return null;
    return rec.ownerId;
  } catch {
    return null;
  }
}
