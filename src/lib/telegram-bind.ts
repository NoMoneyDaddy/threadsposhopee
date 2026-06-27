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

// app_state value 格式：`到期 ISO#ownerId`。ISO 為固定寬度、字典序＝時序，
// 讓清理可用單次 `.lt("value", nowIso)` 刪除過期碼，免全表掃描解析。
function encodeBindValue(expMs: number, ownerId: string): string {
  return `${new Date(expMs).toISOString()}#${ownerId}`;
}

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
    { key: KEY_PREFIX + token, value: encodeBindValue(exp, ownerId), updated_at: new Date().toISOString() },
    { onConflict: "key" }
  );
  if (error) throw new Error(`建立 Telegram 綁定碼失敗：${error.message}`);
  return token;
}

// 消費綁定碼（一次性）：有效則回 ownerId；格式錯、不存在或已過期回 null。
// 用原子 DELETE…RETURNING：只有真正刪到該列的呼叫者拿得到 value，沒有「先查再刪」的 TOCTOU 視窗，徹底防重放。
export async function consumeBindToken(token: string): Promise<string | null> {
  if (!isValidBindToken(token)) return null;
  if (isDemoMode) {
    const rec = demoTokens.get(token);
    demoTokens.delete(token);
    return rec && rec.exp > Date.now() ? rec.ownerId : null;
  }
  const sb = getServiceClient()!;
  const { data, error } = await sb.from("app_state").delete().eq("key", KEY_PREFIX + token).select("value");
  if (error) throw new Error(`消費 Telegram 綁定碼失敗：${error.message}`);
  const value = data?.[0]?.value;
  if (typeof value !== "string") return null; // 不存在或已被其他請求消費
  const sep = value.indexOf("#");
  if (sep < 0) return null;
  const expMs = Date.parse(value.slice(0, sep));
  const ownerId = value.slice(sep + 1);
  if (!ownerId || !Number.isFinite(expMs) || expMs <= Date.now()) return null;
  return ownerId;
}

// 清理過期、未被消費的綁定碼（cron 用，每日一次足矣）。value 以固定寬度 ISO 起頭＝字典序時序，單次刪除。
export async function cleanupExpiredBindTokens(): Promise<{ deleted: number }> {
  if (isDemoMode) {
    const now = Date.now();
    let deleted = 0;
    for (const [t, rec] of demoTokens) {
      if (rec.exp <= now) {
        demoTokens.delete(t);
        deleted++;
      }
    }
    return { deleted };
  }
  const sb = getServiceClient();
  if (!sb) return { deleted: 0 };
  const { data, error } = await sb
    .from("app_state")
    .delete()
    .like("key", `${KEY_PREFIX}%`)
    .lt("value", new Date().toISOString())
    .select("key");
  if (error) throw new Error(`清理過期 Telegram 綁定碼失敗：${error.message}`);
  return { deleted: data?.length ?? 0 };
}
