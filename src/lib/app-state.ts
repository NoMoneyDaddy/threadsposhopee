// app_state 鍵值層：心跳、全域發文暫停、斷路器跨輪冷卻、JSON 快取、發文佇列分布式鎖。
// 由 store.ts 拆出（God File 漸進拆分）；皆以 Supabase `app_state` 單表做 KV，demo 走記憶體。
import { randomUUID } from "node:crypto";
import { getServiceClient } from "./supabase/server";
import { isDemoMode } from "./env";

// 排程心跳（demo 用記憶體）
let demoHeartbeat: string | null = null;
let demoPublishPaused = false;

// 全域發文暫停旗標（app_state）：開啟時發文佇列（cron + 立即跑一輪）整批跳過，緊急急停用。
// 註：不影響草稿頁「核准並發布」單篇手動發（那是操作者明確意圖）。
export async function isPublishPaused(): Promise<boolean> {
  if (isDemoMode) return demoPublishPaused;
  const sb = getServiceClient();
  if (!sb) return false;
  // Fail-safe：讀取失敗就拋錯中斷發文，寧可不發也別在該暫停時誤發（急停安全降級）。
  const { data, error } = await sb.from("app_state").select("value").eq("key", "publish_paused").maybeSingle();
  if (error) throw new Error(`讀取發文暫停狀態失敗：${error.message}`);
  return data?.value === "1";
}
export async function setPublishPaused(paused: boolean): Promise<void> {
  if (isDemoMode) {
    demoPublishPaused = paused;
    return;
  }
  const sb = getServiceClient()!;
  const { error } = await sb
    .from("app_state")
    .upsert({ key: "publish_paused", value: paused ? "1" : "0", updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(`設定發文暫停失敗：${error.message}`);
}

// 寫入排程心跳（任一 cron 成功時呼叫），給儀表板顯示自動駕駛是否運轉。
export async function setHeartbeat(): Promise<void> {
  const nowIso = new Date().toISOString();
  if (isDemoMode) {
    demoHeartbeat = nowIso;
    return;
  }
  const sb = getServiceClient()!;
  await sb
    .from("app_state")
    .upsert({ key: "cron_heartbeat", value: nowIso, updated_at: nowIso }, { onConflict: "key" });
}

// ── 帳號發文斷路器「跨輪」冷卻（app_state key=circuit:<accountId>，value=冷卻到期 ISO）──
// 與單輪 failuresThisRun 互補：壞掉/被封帳號觸發斷路器後寫入冷卻，期內跨 cron 輪次整批跳過，
// 不每輪重新試探；發文成功則解除。demo 模式用記憶體。
const demoCircuit: Record<string, string> = {};

// 回傳冷卻到期的 epoch ms（仍在冷卻中）；未冷卻或已過期回 null。
export async function getAccountCircuitUntil(accountId: string): Promise<number | null> {
  const parse = (v?: string | null) => {
    if (!v) return null;
    const until = Date.parse(v);
    return Number.isFinite(until) && until > Date.now() ? until : null;
  };
  if (isDemoMode) return parse(demoCircuit[accountId]);
  const sb = getServiceClient();
  if (!sb) return null;
  const { data } = await sb.from("app_state").select("value").eq("key", `circuit:${accountId}`).maybeSingle();
  return parse(data?.value);
}

// 觸發冷卻：寫入「now + cooldownMinutes」到期時戳。cooldownMinutes<=0 視為不啟用跨輪冷卻。
export async function tripAccountCircuit(accountId: string, cooldownMinutes: number): Promise<void> {
  if (cooldownMinutes <= 0) return;
  const until = new Date(Date.now() + cooldownMinutes * 60_000).toISOString();
  if (isDemoMode) {
    demoCircuit[accountId] = until;
    return;
  }
  const sb = getServiceClient()!;
  await sb
    .from("app_state")
    .upsert({ key: `circuit:${accountId}`, value: until, updated_at: new Date().toISOString() }, { onConflict: "key" });
}

// 管理頁用：一次讀出所有「仍在冷卻中」的帳號斷路器（key=circuit:<accountId>），回傳 accountId→到期 epoch ms。
// 已過期者略過。僅供 owner-only 管理頁；分頁避免 1000 列截斷。
export async function listActiveCircuits(): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (isDemoMode) {
    const now = Date.now();
    for (const [id, iso] of Object.entries(demoCircuit)) {
      const until = Date.parse(iso);
      if (Number.isFinite(until) && until > now) out.set(id, until);
    }
    return out;
  }
  const sb = getServiceClient();
  if (!sb) return out;
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    // 直接在 DB 過濾掉已過期冷卻（value 為固定寬度 ISO UTC，字典序＝時序），避免過期紀錄累積拖慢查詢。
    const { data, error } = await sb
      .from("app_state")
      .select("key, value")
      .like("key", "circuit:%")
      .gt("value", nowIso)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`讀取斷路器狀態失敗：${error.message}`);
    const rows = (data as { key: string; value: string }[] | null) ?? [];
    for (const r of rows) {
      const until = Date.parse(r.value);
      const accountId = r.key.slice("circuit:".length);
      if (accountId && Number.isFinite(until) && until > now) out.set(accountId, until);
    }
    if (rows.length < PAGE) break;
  }
  return out;
}

// 解除冷卻（帳號恢復正常發文時呼叫）。
export async function clearAccountCircuit(accountId: string): Promise<void> {
  if (isDemoMode) {
    delete demoCircuit[accountId];
    return;
  }
  const sb = getServiceClient();
  if (!sb) return;
  await sb.from("app_state").delete().eq("key", `circuit:${accountId}`);
}

export async function getHeartbeat(): Promise<string | null> {
  if (isDemoMode) return demoHeartbeat;
  const sb = getServiceClient()!;
  // 查詢失敗要拋出，不可吞成 null：否則呼叫端（管理頁狀態面板）會把「讀取失敗」誤判為「從未收到心跳／未開啟」。
  const { data, error } = await sb.from("app_state").select("value").eq("key", "cron_heartbeat").maybeSingle();
  if (error) throw new Error(`讀取排程心跳失敗：${error.message}`);
  return data?.value ?? null;
}

// app_state 上的泛用 JSON 快取（給「即時但可短暫舊」的外部資料用，如 Threads insights，省 API 額度）。
export async function getCachedJson<T>(key: string, maxAgeMs: number): Promise<T | null> {
  if (isDemoMode) return null;
  const sb = getServiceClient()!;
  const { data } = await sb.from("app_state").select("value, updated_at").eq("key", key).maybeSingle();
  if (!data?.value || !data.updated_at) return null;
  if (Date.now() - new Date(data.updated_at).getTime() > maxAgeMs) return null;
  try {
    return JSON.parse(data.value) as T;
  } catch {
    return null;
  }
}

export async function setCachedJson(key: string, value: unknown): Promise<void> {
  if (isDemoMode) return;
  const sb = getServiceClient()!;
  await sb
    .from("app_state")
    .upsert({ key, value: JSON.stringify(value), updated_at: new Date().toISOString() }, { onConflict: "key" });
}

// 發文佇列分布式鎖：避免手動「立即跑一輪」與 cron 排程同時執行 runPublishQueue，
// 各自讀到相同的節奏狀態而同時放行，繞過每帳號最小間隔（防封）。
// 用 app_state 單列做 compare-and-set：value 存「到期 ISO#持有者 token」，
// 只有鎖不存在或已逾期（value < now）才搶得到。ISO UTC 固定寬度，後綴 token
// 不影響字典序＝時序比較（比較在時戳段即分出勝負）。
const PUBLISH_LOCK_KEY = "publish_queue_lock";
const PAST_ISO = new Date(0).toISOString();

// 鎖值格式：到期 ISO + 持有者 token。ISO 為固定寬度 → 後綴 token 不影響字典序＝時序比較
// （CAS 的 `.lt(value, now)` 在時戳段就分出勝負）；release 用 `%#token` 比對只釋放自己持有的鎖。
export function publishLockValue(expiresIso: string, token: string): string {
  return `${expiresIso}#${token}`;
}

// 取得鎖回傳唯一 token（供釋放時驗證持有者）；搶不到回 null。
export async function acquirePublishLock(ttlMinutes = 5, key: string = PUBLISH_LOCK_KEY): Promise<string | null> {
  const token = randomUUID();
  if (isDemoMode) return token; // demo 無併發
  const sb = getServiceClient()!;
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const value = publishLockValue(new Date(now + ttlMinutes * 60000).toISOString(), token);
  // 先確保列存在（初值為過去時間，可立即搶）；已存在則不覆蓋
  await sb
    .from("app_state")
    .upsert(
      { key, value: PAST_ISO, updated_at: nowIso },
      { onConflict: "key", ignoreDuplicates: true }
    );
  // 原子 CAS：UPDATE 取列鎖，只有現有到期時間 < now 才搶得到（回傳該列代表成功）
  const { data } = await sb
    .from("app_state")
    .update({ value, updated_at: nowIso })
    .eq("key", key)
    .lt("value", nowIso)
    .select("key")
    .maybeSingle();
  return data ? token : null;
}

export async function releasePublishLock(key: string = PUBLISH_LOCK_KEY, token?: string): Promise<void> {
  if (isDemoMode) return;
  const sb = getServiceClient()!;
  // 只有自己仍持有（value 帶本次 token）才把到期時間設回過去釋放；
  // 若鎖早已逾期被他輪搶走（value 換成別的 token），則不動，避免誤放他人的鎖。
  let q = sb.from("app_state").update({ value: PAST_ISO, updated_at: new Date().toISOString() }).eq("key", key);
  if (token) q = q.like("value", `%#${token}`);
  await q;
}
