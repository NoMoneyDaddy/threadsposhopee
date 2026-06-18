// 統一資料存取層。
// - 有設定 Supabase → 走 Supabase。
// - 沒設定（Demo 模式）→ 用記憶體 + fixtures，讓 `npm run dev` 不需任何金鑰即可跑。
import { randomUUID } from "node:crypto";
import { getServiceClient } from "./supabase/server";
import { isDemoMode } from "./env";
import { decrypt, encrypt } from "./crypto";
import type { Draft, Source, ThreadsAccount, ShopeeAccount } from "./types";
import demoData from "@/fixtures/demo-data.json";

// ── Demo 記憶體狀態（程序重啟即清空）──────────────────────────
const demo = {
  threadsAccounts: demoData.threadsAccounts as ThreadsAccount[],
  shopeeAccounts: demoData.shopeeAccounts as ShopeeAccount[],
  sources: demoData.sources as Source[],
  drafts: [...(demoData.drafts as Draft[])]
};

export async function listThreadsAccounts(): Promise<ThreadsAccount[]> {
  if (isDemoMode) return demo.threadsAccounts;
  const sb = getServiceClient()!;
  const { data } = await sb.from("threads_accounts").select("id,label,threads_user_id,token_expires_at,status");
  return (data ?? []) as ThreadsAccount[];
}

// 取出 Threads 帳號的發文憑證（解密後）。僅伺服器端使用，Demo 模式回 null。
export async function getThreadsCredentials(
  id: string
): Promise<{ threadsUserId: string; accessToken: string } | null> {
  if (isDemoMode) return null;
  const sb = getServiceClient()!;
  const { data } = await sb
    .from("threads_accounts")
    .select("threads_user_id, access_token_enc")
    .eq("id", id)
    .maybeSingle();
  if (!data?.access_token_enc) return null;
  return { threadsUserId: data.threads_user_id, accessToken: decrypt(data.access_token_enc) };
}

// 新增 Threads 發文帳號（access token / client secret 加密後存放）
export async function createThreadsAccount(input: {
  label: string;
  threads_user_id: string;
  access_token?: string;
  client_secret?: string;
  token_expires_at?: string | null;
}): Promise<ThreadsAccount> {
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

export async function listShopeeAccounts(): Promise<ShopeeAccount[]> {
  if (isDemoMode) return demo.shopeeAccounts;
  const sb = getServiceClient()!;
  const { data } = await sb.from("shopee_accounts").select("id,label,app_id,default_sub_id");
  return (data ?? []) as ShopeeAccount[];
}

// 新增 Shopee 分潤帳號（secret 加密後存放）
export async function createShopeeAccount(input: {
  label: string;
  app_id: string;
  secret: string;
  default_sub_id?: string;
}): Promise<ShopeeAccount> {
  const default_sub_id = input.default_sub_id || "threadspo";
  if (isDemoMode) {
    const acc: ShopeeAccount = {
      id: randomUUID(),
      label: input.label,
      app_id: input.app_id,
      default_sub_id
    };
    demo.shopeeAccounts.unshift(acc);
    return acc;
  }
  const sb = getServiceClient()!;
  const { data, error } = await sb
    .from("shopee_accounts")
    .insert({
      label: input.label,
      app_id: input.app_id,
      secret_enc: encrypt(input.secret),
      default_sub_id
    })
    .select("id,label,app_id,default_sub_id")
    .single();
  if (error) throw error;
  return data as ShopeeAccount;
}

export async function listSources(): Promise<Source[]> {
  if (isDemoMode) return demo.sources;
  const sb = getServiceClient()!;
  const { data } = await sb.from("sources").select("*");
  return (data ?? []) as Source[];
}

// 新增監看來源
export async function createSource(input: {
  threads_account_id: string;
  shopee_account_id?: string | null;
  source_username: string;
  poll_interval_minutes?: number;
  auto_publish?: boolean;
  posts_limit?: number;
}): Promise<Source> {
  const row = {
    threads_account_id: input.threads_account_id,
    shopee_account_id: input.shopee_account_id ?? null,
    source_username: input.source_username.trim().replace(/^@/, ""),
    enabled: true,
    poll_interval_minutes: input.poll_interval_minutes ?? 15,
    auto_publish: input.auto_publish ?? false,
    posts_limit: input.posts_limit ?? 1
  };
  if (isDemoMode) {
    const src: Source = { id: randomUUID(), last_polled_at: null, ...row };
    demo.sources.unshift(src);
    return src;
  }
  const sb = getServiceClient()!;
  const { data, error } = await sb.from("sources").insert(row).select("*").single();
  if (error) throw error;
  return data as Source;
}

export async function listDrafts(): Promise<Draft[]> {
  if (isDemoMode) {
    return [...demo.drafts].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  const sb = getServiceClient()!;
  const { data } = await sb.from("drafts").select("*").order("created_at", { ascending: false }).limit(100);
  return (data ?? []) as Draft[];
}

export async function getDraft(id: string): Promise<Draft | null> {
  if (isDemoMode) return demo.drafts.find((d) => d.id === id) ?? null;
  const sb = getServiceClient()!;
  const { data } = await sb.from("drafts").select("*").eq("id", id).maybeSingle();
  return (data as Draft) ?? null;
}

export async function createDraft(input: Partial<Draft>): Promise<Draft> {
  const draft: Draft = {
    id: randomUUID(),
    status: "draft",
    created_at: new Date().toISOString(),
    ...input
  } as Draft;

  if (isDemoMode) {
    demo.drafts.unshift(draft);
    return draft;
  }
  const sb = getServiceClient()!;
  const { data, error } = await sb.from("drafts").insert(draft).select().single();
  if (error) throw error;
  return data as Draft;
}

export async function updateDraftStatus(id: string, status: Draft["status"], patch: Partial<Draft> = {}) {
  if (isDemoMode) {
    const d = demo.drafts.find((x) => x.id === id);
    if (d) Object.assign(d, { status, ...patch });
    return d;
  }
  const sb = getServiceClient()!;
  const { data } = await sb.from("drafts").update({ status, ...patch }).eq("id", id).select().single();
  return data as Draft;
}

// 原子性狀態更新（compare-and-swap）：只有當目前狀態 == expectedStatus 才更新。
// 用於發文 worker 鎖定草稿，避免多個排程實例同時抓到同一篇而重複發文。
export async function updateDraftStatusAtomic(
  id: string,
  status: Draft["status"],
  expectedStatus: Draft["status"],
  patch: Partial<Draft> = {}
): Promise<Draft | null> {
  if (isDemoMode) {
    const d = demo.drafts.find((x) => x.id === id);
    if (d && d.status === expectedStatus) {
      Object.assign(d, { status, ...patch });
      return d;
    }
    return null;
  }
  const sb = getServiceClient()!;
  const { data } = await sb
    .from("drafts")
    .update({ status, ...patch })
    .eq("id", id)
    .eq("status", expectedStatus)
    .select()
    .maybeSingle();
  return (data as Draft) ?? null;
}

// 發文佇列：取出可發布的草稿（已核准、且排程時間到了或未排程）
export async function listApprovedDrafts(): Promise<Draft[]> {
  const nowIso = new Date().toISOString();
  if (isDemoMode) {
    return demo.drafts
      .filter((d) => d.status === "approved" && (!d.scheduled_at || d.scheduled_at <= nowIso))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
  const sb = getServiceClient()!;
  const { data } = await sb
    .from("drafts")
    .select("*")
    .eq("status", "approved")
    .or(`scheduled_at.is.null,scheduled_at.lte.${nowIso}`)
    .order("created_at", { ascending: true });
  return (data ?? []) as Draft[];
}

// 某 Threads 帳號的發文節奏狀態：最後一次發文時間、近 24h 已發數（用於防封閘門）
export async function getAccountPublishState(
  threadsAccountId: string
): Promise<{ lastPublishedAt: string | null; publishedLast24h: number }> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  if (isDemoMode) {
    const published = demo.drafts.filter(
      (d) => d.threads_account_id === threadsAccountId && d.status === "published"
    );
    const last = published
      .map((d) => d.published_at ?? d.created_at)
      .sort()
      .pop();
    return {
      lastPublishedAt: last ?? null,
      publishedLast24h: published.filter((d) => (d.published_at ?? d.created_at) >= since).length
    };
  }
  const sb = getServiceClient()!;
  // 只取最後一筆發文時間（不拉全量歷史）
  const { data: latest } = await sb
    .from("drafts")
    .select("published_at")
    .eq("threads_account_id", threadsAccountId)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(1);
  // 近 24h 已發數用 count 聚合（head:true 不拉資料列）
  const { count } = await sb
    .from("drafts")
    .select("*", { count: "exact", head: true })
    .eq("threads_account_id", threadsAccountId)
    .eq("status", "published")
    .gte("published_at", since);
  return {
    lastPublishedAt: latest?.[0]?.published_at ?? null,
    publishedLast24h: count ?? 0
  };
}

// 去重：來源貼文是否已處理過
export async function isPostProcessed(sourceId: string, postId: string): Promise<boolean> {
  if (isDemoMode) {
    return demo.drafts.some((d) => d.source_id === sourceId && d.source_post_id === postId);
  }
  const sb = getServiceClient()!;
  const { data } = await sb
    .from("processed_posts")
    .select("id")
    .eq("source_id", sourceId)
    .eq("post_id", postId)
    .maybeSingle();
  return Boolean(data);
}

export async function markPostProcessed(sourceId: string, postId: string) {
  if (isDemoMode) return;
  const sb = getServiceClient()!;
  await sb.from("processed_posts").upsert({ source_id: sourceId, post_id: postId }, { onConflict: "source_id,post_id" });
}
