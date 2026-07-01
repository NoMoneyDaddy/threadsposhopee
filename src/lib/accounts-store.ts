// Threads／Shopee 帳號資料層：CRUD、憑證解密、擁有權檢查、token 展期。
// 由 store.ts 拆出（God File 漸進拆分）。多租戶鐵則：service-role 繞 RLS，一律帶 ownerId 過濾。
import { randomUUID } from "node:crypto";
import { getServiceClient } from "./supabase/server";
import { isDemoMode } from "./env";
import { demo } from "./demo-store";
import { decrypt, encrypt } from "./crypto";
import { log } from "./logger";
import { getThreadsAccountLimit } from "./account-limits";
import { clearSponsorStateForAccount } from "./sponsor";
import type { ThreadsAccount, ShopeeAccount } from "./types";

export async function listThreadsAccounts(ownerId: string): Promise<ThreadsAccount[]> {
  if (isDemoMode) return demo.threadsAccounts;
  const sb = getServiceClient()!;
  const { data, error } = await sb
    .from("threads_accounts")
    .select("id,label,threads_user_id,display_name,avatar_url,token_expires_at,status")
    .eq("owner_id", ownerId);
  // 查詢失敗勿吞成空陣列：否則 migration 未套用/查詢異常會被 UI 誤顯示成「沒有帳號」。
  if (error) throw error;
  return (data ?? []) as ThreadsAccount[];
}

// 帳號配額：該使用者是否還能再「連結一個新的」Threads 發文帳號。
// - 本站不收費、無方案分層：一般使用者固定上限，管理者取較高的全站硬上限。
// - 既有同一 threads_user_id（重新授權／更新）不占新名額。
// - demo 模式不限制。
// 回傳 used/limit 供 UI 顯示與 402 訊息使用。
export async function canAddThreadsAccount(
  ownerId: string,
  opts: { isOwner?: boolean; threadsUserId?: string } = {}
): Promise<{ ok: boolean; used: number; limit: number }> {
  const limit = getThreadsAccountLimit(opts.isOwner);
  if (isDemoMode) return { ok: true, used: 0, limit };
  const accounts = await listThreadsAccounts(ownerId);
  const used = accounts.length;
  // 重新授權既有帳號（同 threads_user_id）不算新增（仍受上限保護，因未增加數量）。
  if (opts.threadsUserId && accounts.some((a) => a.threads_user_id === opts.threadsUserId)) {
    return { ok: true, used, limit };
  }
  return { ok: used < limit, used, limit };
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

// 該 Shopee 分潤帳號是否屬於此使用者（建來源前驗證，擋跨租戶冒用 account id）。
export async function userOwnsShopeeAccount(accountId: string, ownerId: string): Promise<boolean> {
  if (isDemoMode) return true;
  const sb = getServiceClient()!;
  const { data } = await sb
    .from("shopee_accounts")
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
    .select("id,label,threads_user_id,display_name,avatar_url,token_expires_at,status")
    .single();
  if (error) throw error;
  return data as ThreadsAccount;
}

// OAuth 連帳號：依 (owner_id, threads_user_id) 新增或更新。
// 既有帳號重新授權時更新 token 與個人檔案（顯示名稱/頭像），但「保留使用者自訂暱稱（label）」不被 username 覆蓋。
const THREADS_ACC_COLS = "id,label,threads_user_id,display_name,avatar_url,token_expires_at,status";
export async function upsertThreadsAccountFromOAuth(
  input: {
    label: string;
    threads_user_id: string;
    display_name?: string | null;
    avatar_url?: string | null;
    access_token: string;
    token_expires_at: string | null; // null＝到期日未知（無法換/展長效）→ 由展期 worker 立即接手或標記
  },
  ownerId: string
): Promise<ThreadsAccount> {
  if (isDemoMode) {
    const existing = demo.threadsAccounts.find((a) => a.threads_user_id === input.threads_user_id);
    if (existing) {
      existing.token_expires_at = input.token_expires_at;
      // 僅在有提供時才覆寫，避免抓檔失敗（undefined）清空既有頭像/名稱。
      if (input.display_name !== undefined) existing.display_name = input.display_name;
      if (input.avatar_url !== undefined) existing.avatar_url = input.avatar_url;
      existing.status = "active";
      return existing;
    }
    const acc: ThreadsAccount = {
      id: randomUUID(),
      label: input.label,
      threads_user_id: input.threads_user_id,
      display_name: input.display_name ?? null,
      avatar_url: input.avatar_url ?? null,
      token_expires_at: input.token_expires_at,
      status: "active"
    };
    demo.threadsAccounts.unshift(acc);
    return acc;
  }
  const sb = getServiceClient()!;
  // token 欄位每次必更新。個人檔案（顯示名稱/頭像）僅在有提供時才寫入：
  // 抓檔失敗時為 undefined，條件式略過以免清空既有真實資料。
  const profile: {
    access_token_enc: string;
    token_expires_at: string | null;
    status: "active";
    display_name?: string | null;
    avatar_url?: string | null;
  } = {
    access_token_enc: encrypt(input.access_token),
    token_expires_at: input.token_expires_at,
    status: "active"
  };
  if (input.display_name !== undefined) profile.display_name = input.display_name;
  if (input.avatar_url !== undefined) profile.avatar_url = input.avatar_url;
  // 先查既有列：存在則只更新（保留 label 自訂暱稱）；否則新增（label 預設帶入 username）。
  // OAuth 回呼為單一使用者請求、無併發，(owner_id, threads_user_id) 唯一索引仍防重複。
  const existing = await sb
    .from("threads_accounts")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("threads_user_id", input.threads_user_id)
    .maybeSingle();
  if (existing.error) throw existing.error; // 查詢異常勿吞，否則會誤走 insert 撞唯一鍵
  if (existing.data) {
    const { data, error } = await sb
      .from("threads_accounts")
      .update(profile)
      .eq("id", existing.data.id)
      .eq("owner_id", ownerId) // 縱深防禦：更新一律帶 owner 過濾
      .select(THREADS_ACC_COLS)
      .single();
    if (error) throw error;
    return data as ThreadsAccount;
  }
  let { data, error } = await sb
    .from("threads_accounts")
    .insert({ owner_id: ownerId, threads_user_id: input.threads_user_id, label: input.label, ...profile })
    .select(THREADS_ACC_COLS)
    .single();
  // 併發重新授權競態：兩請求都沒查到既有列、後插入者撞 (owner_id, threads_user_id) 唯一鍵（23505）→ 改為更新既有列。
  if (error?.code === "23505") {
    ({ data, error } = await sb
      .from("threads_accounts")
      .update(profile)
      .eq("owner_id", ownerId)
      .eq("threads_user_id", input.threads_user_id)
      .select(THREADS_ACC_COLS)
      .single());
  }
  if (error) throw error;
  return data as ThreadsAccount;
}

// 重新命名發文帳號的自訂暱稱（label）。多租戶：以 owner_id 過濾。
export async function renameThreadsAccount(id: string, ownerId: string, label: string): Promise<boolean> {
  if (isDemoMode) {
    const a = demo.threadsAccounts.find((x) => x.id === id);
    if (!a) return false;
    a.label = label;
    return true;
  }
  const sb = getServiceClient()!;
  const { data, error } = await sb
    .from("threads_accounts")
    .update({ label })
    .eq("id", id)
    .eq("owner_id", ownerId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function listShopeeAccounts(ownerId: string): Promise<ShopeeAccount[]> {
  if (isDemoMode) return demo.shopeeAccounts;
  const sb = getServiceClient()!;
  const { data, error } = await sb.from("shopee_accounts").select("id,label,app_id,default_sub_id").eq("owner_id", ownerId);
  // 查詢失敗勿吞成空陣列：否則會被 UI 誤判成「未綁定」，隱藏現況與解除綁定入口（同 listThreadsAccounts）。
  if (error) throw error;
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

// 綁定 Shopee 分潤帳號（secret 加密後存放）。每位使用者僅一組：已存在則覆寫既有那筆。
export async function createShopeeAccount(
  input: { label?: string; app_id: string; secret: string; default_sub_id?: string },
  ownerId: string
): Promise<ShopeeAccount> {
  // 不再注入預設 "threadspo"：未填則存空字串（欄位 NOT NULL，空字串即「無預設來源標記」）。
  const default_sub_id = input.default_sub_id?.trim() || "";
  // 不再讓使用者自取顯示名稱（一人一組）：固定標籤，欄位 NOT NULL。
  const label = input.label?.trim() || "蝦皮分潤";
  if (isDemoMode) {
    // demo store 為單租戶（不分 owner，listShopeeAccounts 也回全部）：一人一組＝覆寫第一筆。
    const existing = demo.shopeeAccounts[0];
    if (existing) {
      existing.app_id = input.app_id;
      existing.default_sub_id = default_sub_id;
      return existing;
    }
    const acc: ShopeeAccount = { id: randomUUID(), label, app_id: input.app_id, default_sub_id };
    demo.shopeeAccounts.unshift(acc);
    return acc;
  }
  const sb = getServiceClient()!;
  // 一人一組：owner_id 唯一索引（migration 0047）保證；單句 upsert 原子覆寫，免去先查再寫的 TOCTOU 競態與排序不一致。
  const { data, error } = await sb
    .from("shopee_accounts")
    .upsert(
      { owner_id: ownerId, label, app_id: input.app_id, secret_enc: encrypt(input.secret), default_sub_id },
      { onConflict: "owner_id" }
    )
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
  // 清除各被刪帳號的贊助文 app_state（無 FK，不會隨帳號列 cascade）；失敗僅記錄。
  for (const row of data ?? []) {
    await clearSponsorStateForAccount((row as { id: string }).id).catch((e) =>
      log.warn("清除贊助文 app_state 失敗", { accId: (row as { id: string }).id, err: e })
    );
  }
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
  if (data) {
    // 清除該帳號的贊助文 app_state（無 FK，不隨帳號 cascade）；失敗僅記錄。
    await clearSponsorStateForAccount(id).catch((e) => log.warn("清除贊助文 app_state 失敗", { accId: id, err: e }));
  }
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

// 永久刪除整個使用者帳號（不可復原）。
// 做法：先刪 Supabase auth 使用者，靠 FK 的 ON DELETE CASCADE 連動清除其所有自有資料
// （profiles/drafts/materials/sources/threads_accounts/shopee_accounts/ai_agents/
//  push_subscriptions/redirect_links… 及其下游 processed_posts/metrics/ai_agent_seen）。
// 相較手動逐表刪，可避免「刪一半才失敗」的半刪狀態，也不會因新增資料表漏刪而漂移。
export async function deleteOwnerAccount(ownerId: string): Promise<void> {
  if (isDemoMode) return;
  const sb = getServiceClient()!;
  // 先記下此人所有 Threads 帳號 id：刪 auth 使用者後帳號列會被 cascade 清掉、無法再列舉，
  // 需先取出以清除「以帳號 id 為鍵」的贊助文 app_state（紀錄/自選/違規累計）。
  const { data: accs } = await sb.from("threads_accounts").select("id").eq("owner_id", ownerId);
  const accountIds = (accs ?? []).map((a) => (a as { id: string }).id);

  // 核心刪除：失敗則上拋，讓呼叫端回報（此時尚未動任何資料，可安全重試）。
  const { error: authErr } = await sb.auth.admin.deleteUser(ownerId);
  if (authErr) throw new Error(`刪除登入帳號失敗：${authErr.message}`);

  // 以下為「未隨 FK cascade 連動」的殘留資料，盡力清除；失敗僅記錄、不影響整體結果
  // （帳號與主資料已移除，殘留不致洩漏且可日後清理）。
  // 註：已發佈到 Threads 的「貼文本身」無法由 API 刪除（無刪文端點），須由使用者自行移除。
  try {
    // 贊助文 app_state：key-value 表，無 FK，需以先前取得的帳號 id 逐一清（紀錄/自選/違規/累積/禁用/黑名單）。
    for (const accId of accountIds) {
      await clearSponsorStateForAccount(accId);
    }
    // owner 層級的贊助欠抽計數（跨帳號轉嫁）：無 FK，隨帳號刪一併清。
    await sb.from("app_state").delete().eq("key", `sponsor:redebt:${ownerId}`);
    // material_favorites.owner_id 無 FK：使用者收藏「別人」素材的列不會隨自己素材的 cascade 一起刪。
    await sb.from("material_favorites").delete().eq("owner_id", ownerId);
  } catch (e) {
    log.error("刪除帳號後清理殘留資料失敗（帳號已刪除）", { ownerId, err: e });
  }
}

// 取某使用者啟用中的 Threads 帳號 + 解密 token（儀表板查額度用）
// 跨租戶 worker 查詢（僅由 cron 呼叫、不吃使用者輸入）：所有 active 發文帳號（id/owner/threadsUser）。
// 用於贊助文自動補發：找出今天還沒有贊助文的非 owner 帳號。
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

// 跨租戶取「全部 active 且有 token」帳號（含解密 token）：給每日頭像/個人檔案刷新 worker 用。
// 僅 cron 呼叫；實際寫回仍以該列自己的 owner_id 過濾。
export async function listActiveThreadsTokensAll(): Promise<
  { id: string; label: string; ownerId: string | null; accessToken: string }[]
> {
  if (isDemoMode) return [];
  const sb = getServiceClient()!;
  const { data, error } = await sb
    .from("threads_accounts")
    .select("id, label, owner_id, access_token_enc")
    .eq("status", "active")
    .not("access_token_enc", "is", null);
  if (error) throw error; // 查詢失敗勿吞成空陣列（否則每日刷新誤判成「沒帳號要刷」而靜默失效）
  return (data ?? [])
    .map((r) => {
      try {
        return { id: r.id, label: r.label, ownerId: r.owner_id ?? null, accessToken: decrypt(r.access_token_enc) };
      } catch (e) {
        log.error("解密 Threads token 失敗（個人檔案刷新）", { accountId: r.id, accountLabel: r.label, err: e });
        return null;
      }
    })
    .filter((x): x is { id: string; label: string; ownerId: string | null; accessToken: string } => x !== null);
}

// 只更新個人檔案欄位（顯示名稱／頭像）：頭像 URL 為會過期的簽名連結，每日刷新避免失效。
// 僅在有值時寫入（抓檔失敗回 undefined 時略過，不清空既有真實資料）。
export async function updateThreadsAccountProfile(
  id: string,
  ownerId: string | null,
  input: { display_name?: string | null; avatar_url?: string | null }
): Promise<void> {
  if (isDemoMode) return;
  const patch: { display_name?: string | null; avatar_url?: string | null } = {};
  if (input.display_name !== undefined) patch.display_name = input.display_name;
  if (input.avatar_url !== undefined) patch.avatar_url = input.avatar_url;
  if (Object.keys(patch).length === 0) return;
  const sb = getServiceClient()!;
  let q = sb.from("threads_accounts").update(patch).eq("id", id);
  if (ownerId) q = q.eq("owner_id", ownerId);
  const { error } = await q;
  if (error) throw error;
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
