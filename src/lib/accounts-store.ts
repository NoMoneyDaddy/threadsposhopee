// Threads／Shopee 帳號資料層：CRUD、憑證解密、擁有權檢查、token 展期。
// 由 store.ts 拆出（God File 漸進拆分）。多租戶鐵則：service-role 繞 RLS，一律帶 ownerId 過濾。
import { randomUUID } from "node:crypto";
import { getServiceClient } from "./supabase/server";
import { isDemoMode } from "./env";
import { demo } from "./demo-store";
import { decrypt, encrypt } from "./crypto";
import { log } from "./logger";
import { planLimits, GLOBAL_MAX_THREADS_ACCOUNTS } from "./plans";
import { getUserPlan } from "./credentials";
import type { ThreadsAccount, ShopeeAccount } from "./types";

export async function listThreadsAccounts(ownerId: string): Promise<ThreadsAccount[]> {
  if (isDemoMode) return demo.threadsAccounts;
  const sb = getServiceClient()!;
  const { data } = await sb
    .from("threads_accounts")
    .select("id,label,threads_user_id,token_expires_at,status")
    .eq("owner_id", ownerId);
  return (data ?? []) as ThreadsAccount[];
}

// 方案配額：該使用者是否還能再「連結一個新的」Threads 發文帳號。
// - owner 是部署擁有者，不受方案限制。
// - 既有同一 threads_user_id（重新授權／更新）不占新名額。
// - demo 模式不限制。
// 回傳含 plan/used/limit 供 UI 顯示與 402 訊息使用。
export async function canAddThreadsAccount(
  ownerId: string,
  opts: { isOwner?: boolean; threadsUserId?: string } = {}
): Promise<{ ok: boolean; plan: string; used: number; limit: number }> {
  if (isDemoMode) return { ok: true, plan: "free", used: 0, limit: planLimits("free").maxThreadsAccounts };
  const [plan, accounts] = await Promise.all([getUserPlan(ownerId), listThreadsAccounts(ownerId)]);
  // 全站硬上限 20（含管理者）：管理者取硬上限，一般使用者取方案與硬上限的較小值。
  const limit = opts.isOwner
    ? GLOBAL_MAX_THREADS_ACCOUNTS
    : Math.min(planLimits(plan).maxThreadsAccounts, GLOBAL_MAX_THREADS_ACCOUNTS);
  const used = accounts.length;
  // 重新授權既有帳號（同 threads_user_id）不算新增（仍受硬上限保護，因未增加數量）。
  if (opts.threadsUserId && accounts.some((a) => a.threads_user_id === opts.threadsUserId)) {
    return { ok: true, plan, used, limit };
  }
  return { ok: used < limit, plan, used, limit };
}

// 取出 Threads 帳號的發文憑證（解密後）。僅伺服器端使用，Demo 模式回 null。
// 一律帶 ownerId 並過濾 owner_id：service-role 會繞過 RLS，若只用 id 查，
// 任一登入者拿到別人的 account id 就能代發＝跨租戶越權。多租戶鐵則。
export async function getThreadsCredentials(
  id: string,
  ownerId: string
): Promise<{ threadsUserId: string; accessToken: string } | null> {
  if (isDemoMode) return null;
  const sb = getServiceClient()!;
  const { data } = await sb
    .from("threads_accounts")
    .select("threads_user_id, access_token_enc")
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (!data?.access_token_enc) return null;
  return { threadsUserId: data.threads_user_id, accessToken: decrypt(data.access_token_enc) };
}

// 該 Threads 帳號是否屬於此使用者（建草稿/發文前驗證，擋跨租戶冒用 account id）。
export async function userOwnsThreadsAccount(accountId: string, ownerId: string): Promise<boolean> {
  if (isDemoMode) return true;
  const sb = getServiceClient()!;
  const { data } = await sb
    .from("threads_accounts")
    .select("id")
    .eq("id", accountId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  return Boolean(data);
}

// 該使用者所有啟用帳號的解密 token（依 account id 索引）。貼文互動數據需逐帳號 token 查 insights。
export async function listThreadsAccountTokens(ownerId: string): Promise<{ id: string; accessToken: string }[]> {
  if (isDemoMode) return [];
  const sb = getServiceClient()!;
  const { data } = await sb
    .from("threads_accounts")
    .select("id, access_token_enc, status")
    .eq("owner_id", ownerId)
    .eq("status", "active");
  return (data ?? [])
    .filter((r) => r.access_token_enc)
    .map((r) => {
      try {
        return { id: r.id, accessToken: decrypt(r.access_token_enc) };
      } catch (e) {
        log.error("解密 Threads token 失敗", { ownerId, accountId: r.id, err: e });
        return null;
      }
    })
    .filter((x): x is { id: string; accessToken: string } => x !== null);
}

// 新增 Threads 發文帳號（access token / client secret 加密後存放）
export async function createThreadsAccount(
  input: {
    label: string;
    threads_user_id: string;
    access_token?: string;
    client_secret?: string;
    token_expires_at?: string | null;
  },
  ownerId: string
): Promise<ThreadsAccount> {
  if (isDemoMode) {
    const acc: ThreadsAccount = {
      id: randomUUID(),
      label: input.label,
      threads_user_id: input.threads_user_id,
      token_expires_at: input.token_expires_at ?? null,
      status: "active"
    };
    demo.threadsAccounts.unshift(acc);
    return acc;
  }
  const sb = getServiceClient()!;
  const { data, error } = await sb
    .from("threads_accounts")
    .insert({
      owner_id: ownerId,
      label: input.label,
      threads_user_id: input.threads_user_id,
      access_token_enc: input.access_token ? encrypt(input.access_token) : null,
      client_secret_enc: input.client_secret ? encrypt(input.client_secret) : null,
      token_expires_at: input.token_expires_at ?? null,
      status: "active"
    })
    .select("id,label,threads_user_id,token_expires_at,status")
    .single();
  if (error) throw error;
  return data as ThreadsAccount;
}

// OAuth 連帳號：依 (owner_id, threads_user_id) upsert。已存在則更新 token，否則新增。
export async function upsertThreadsAccountFromOAuth(
  input: {
    label: string;
    threads_user_id: string;
    access_token: string;
    token_expires_at: string;
  },
  ownerId: string
): Promise<ThreadsAccount> {
  if (isDemoMode) {
    const existing = demo.threadsAccounts.find((a) => a.threads_user_id === input.threads_user_id);
    if (existing) {
      existing.label = input.label;
      existing.token_expires_at = input.token_expires_at;
      existing.status = "active";
      return existing;
    }
    const acc: ThreadsAccount = {
      id: randomUUID(),
      label: input.label,
      threads_user_id: input.threads_user_id,
      token_expires_at: input.token_expires_at,
      status: "active"
    };
    demo.threadsAccounts.unshift(acc);
    return acc;
  }
  // 用 upsert 確保原子性、避免併發競態（依 migration 0006 的 (owner_id, threads_user_id) 唯一索引）
  const sb = getServiceClient()!;
  const payload = {
    owner_id: ownerId,
    threads_user_id: input.threads_user_id,
    label: input.label,
    access_token_enc: encrypt(input.access_token),
    token_expires_at: input.token_expires_at,
    status: "active"
  };
  const { data, error } = await sb
    .from("threads_accounts")
    .upsert(payload, { onConflict: "owner_id,threads_user_id" })
    .select("id,label,threads_user_id,token_expires_at,status")
    .single();
  if (error) throw error;
  return data as ThreadsAccount;
}

export async function listShopeeAccounts(ownerId: string): Promise<ShopeeAccount[]> {
  if (isDemoMode) return demo.shopeeAccounts;
  const sb = getServiceClient()!;
  const { data } = await sb.from("shopee_accounts").select("id,label,app_id,default_sub_id").eq("owner_id", ownerId);
  return (data ?? []) as ShopeeAccount[];
}

// 取出某使用者的 Shopee 分潤憑證（解密）。member 用自己的金鑰轉連結。
export async function getShopeeCredentials(
  ownerId: string
): Promise<{ appId: string; secret: string; subId: string } | null> {
  if (isDemoMode) return null;
  const sb = getServiceClient()!;
  const { data } = await sb
    .from("shopee_accounts")
    .select("app_id, secret_enc, default_sub_id")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data?.secret_enc) return null;
  return { appId: data.app_id, secret: decrypt(data.secret_enc), subId: data.default_sub_id };
}

// 新增 Shopee 分潤帳號（secret 加密後存放）
export async function createShopeeAccount(
  input: { label: string; app_id: string; secret: string; default_sub_id?: string },
  ownerId: string
): Promise<ShopeeAccount> {
  const default_sub_id = input.default_sub_id || "threadspo";
  if (isDemoMode) {
    const acc: ShopeeAccount = { id: randomUUID(), label: input.label, app_id: input.app_id, default_sub_id };
    demo.shopeeAccounts.unshift(acc);
    return acc;
  }
  const sb = getServiceClient()!;
  const { data, error } = await sb
    .from("shopee_accounts")
    .insert({ owner_id: ownerId, label: input.label, app_id: input.app_id, secret_enc: encrypt(input.secret), default_sub_id })
    .select("id,label,app_id,default_sub_id")
    .single();
  if (error) throw error;
  return data as ShopeeAccount;
}

// 設定 Threads 帳號狀態（active=啟用、paused=暫停排程）
export async function setThreadsAccountStatus(
  id: string,
  ownerId: string,
  status: "active" | "paused"
): Promise<boolean> {
  if (isDemoMode) {
    const a = demo.threadsAccounts.find((x) => x.id === id);
    if (!a) return false;
    a.status = status;
    return true;
  }
  const sb = getServiceClient()!;
  const { data, error } = await sb
    .from("threads_accounts")
    .update({ status })
    .eq("id", id)
    .eq("owner_id", ownerId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

// 由 Meta 解除授權／資料刪除回呼觸發（無登入情境）：依 threads_user_id 刪除對應發文帳號與 token。
export async function deleteThreadsAccountsByThreadsUserId(threadsUserId: string): Promise<number> {
  if (isDemoMode) {
    const before = demo.threadsAccounts.length;
    demo.threadsAccounts = demo.threadsAccounts.filter((a) => a.threads_user_id !== threadsUserId);
    return before - demo.threadsAccounts.length;
  }
  const sb = getServiceClient()!;
  const { data, error } = await sb
    .from("threads_accounts")
    .delete()
    .eq("threads_user_id", threadsUserId)
    .select("id");
  if (error) throw error;
  return data?.length ?? 0;
}

export async function deleteThreadsAccount(id: string, ownerId: string): Promise<boolean> {
  if (isDemoMode) {
    const i = demo.threadsAccounts.findIndex((x) => x.id === id);
    if (i < 0) return false;
    demo.threadsAccounts.splice(i, 1);
    return true;
  }
  const sb = getServiceClient()!;
  const { data, error } = await sb
    .from("threads_accounts")
    .delete()
    .eq("id", id)
    .eq("owner_id", ownerId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function deleteShopeeAccount(id: string, ownerId: string): Promise<boolean> {
  if (isDemoMode) {
    const i = demo.shopeeAccounts.findIndex((x) => x.id === id);
    if (i < 0) return false;
    demo.shopeeAccounts.splice(i, 1);
    return true;
  }
  const sb = getServiceClient()!;
  const { data, error } = await sb
    .from("shopee_accounts")
    .delete()
    .eq("id", id)
    .eq("owner_id", ownerId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

// 取某使用者啟用中的 Threads 帳號 + 解密 token（儀表板查額度用）
// 跨租戶 worker 查詢（僅由 cron 呼叫、不吃使用者輸入）：所有 active 發文帳號（id/owner/threadsUser）。
// 用於贊助文章自動補發：找出今天還沒有贊助文的非 owner 帳號。
export async function listActiveThreadsAccountsAll(): Promise<
  { id: string; owner_id: string; threads_user_id: string; label: string }[]
> {
  if (isDemoMode) return [];
  const sb = getServiceClient()!;
  const { data } = await sb
    .from("threads_accounts")
    .select("id, owner_id, threads_user_id, label")
    .eq("status", "active");
  return (data ?? []) as { id: string; owner_id: string; threads_user_id: string; label: string }[];
}

export async function listActiveThreadsCredentials(
  ownerId: string
): Promise<{ label: string; threadsUserId: string; accessToken: string }[]> {
  if (isDemoMode) return [];
  const sb = getServiceClient()!;
  const { data } = await sb
    .from("threads_accounts")
    .select("label, threads_user_id, access_token_enc, status")
    .eq("owner_id", ownerId)
    .eq("status", "active");
  return (data ?? [])
    .filter((r) => r.access_token_enc)
    .map((r) => {
      try {
        return { label: r.label, threadsUserId: r.threads_user_id, accessToken: decrypt(r.access_token_enc) };
      } catch (e) {
        log.error("解密 Threads token 失敗", { ownerId, accountLabel: r.label, err: e });
        return null;
      }
    })
    .filter((x): x is { label: string; threadsUserId: string; accessToken: string } => x !== null);
}

// 全域取出「即將到期」的 Threads 長期 token（worker 用，跨租戶）。
// thresholdDays：到期前幾天內就先展期（預設 7 天）。
export async function listThreadsTokensToRefresh(
  thresholdDays = 7
): Promise<{ id: string; label: string; accessToken: string; ownerId: string | null }[]> {
  if (isDemoMode) return [];
  const sb = getServiceClient()!;
  const cutoff = new Date(Date.now() + thresholdDays * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await sb
    .from("threads_accounts")
    .select("id, label, owner_id, access_token_enc, token_expires_at")
    .eq("status", "active")
    .not("access_token_enc", "is", null)
    // 含「無到期日」的 active 帳號：Postgres 對 NULL 的 .lte 回 false，會讓無到期日帳號
    // 永不展期、60 天後靜默過期且從不進 worker。以 or 補上 is null。
    .or(`token_expires_at.lte.${cutoff},token_expires_at.is.null`);
  return (data ?? [])
    .map((r) => {
      try {
        return { id: r.id, label: r.label, ownerId: r.owner_id ?? null, accessToken: decrypt(r.access_token_enc) };
      } catch (e) {
        log.error("解密 Threads token 失敗（展期 worker）", { accountId: r.id, accountLabel: r.label, err: e });
        return null;
      }
    })
    .filter((x): x is { id: string; label: string; accessToken: string; ownerId: string | null } => x !== null);
}

// 更新某帳號的長期 token + 到期日（展期後寫回，加密存放）。
// ownerId 有值時一併過濾（縱深防禦：service-role 繞 RLS，全程帶 owner 較安全）。
export async function updateThreadsToken(
  id: string,
  accessToken: string,
  expiresAt: string,
  ownerId?: string | null
): Promise<void> {
  if (isDemoMode) return;
  const sb = getServiceClient()!;
  let q = sb
    .from("threads_accounts")
    .update({ access_token_enc: encrypt(accessToken), token_expires_at: expiresAt, status: "active" })
    .eq("id", id);
  if (ownerId) q = q.eq("owner_id", ownerId);
  const { error } = await q;
  if (error) throw error;
}

// 展期失敗時標記帳號為 error，讓前端看得到、停止排程它。
export async function markThreadsAccountError(id: string, ownerId?: string | null): Promise<void> {
  if (isDemoMode) return;
  const sb = getServiceClient()!;
  let q = sb.from("threads_accounts").update({ status: "error" }).eq("id", id);
  if (ownerId) q = q.eq("owner_id", ownerId);
  const { error } = await q;
  if (error) throw error; // 不靜默失敗：讓呼叫端的 .catch 能記錄（否則帳號未真的標 error）
}
