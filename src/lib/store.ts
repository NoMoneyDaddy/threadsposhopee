// 統一資料存取層。
// - 有設定 Supabase → 走 Supabase。
// - 沒設定（Demo 模式）→ 用記憶體 + fixtures，讓 `npm run dev` 不需任何金鑰即可跑。
import { randomUUID } from "node:crypto";
import { getServiceClient } from "./supabase/server";
import { isDemoMode } from "./env";
import { decrypt } from "./crypto";
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

export async function listShopeeAccounts(): Promise<ShopeeAccount[]> {
  if (isDemoMode) return demo.shopeeAccounts;
  const sb = getServiceClient()!;
  const { data } = await sb.from("shopee_accounts").select("id,label,app_id,default_sub_id");
  return (data ?? []) as ShopeeAccount[];
}

export async function listSources(): Promise<Source[]> {
  if (isDemoMode) return demo.sources;
  const sb = getServiceClient()!;
  const { data } = await sb.from("sources").select("*");
  return (data ?? []) as Source[];
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
