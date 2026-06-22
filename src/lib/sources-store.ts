// 監看來源資料層（owner 專屬）＋來源貼文去重。由 store.ts 拆出（God File 漸進拆分）。
import { randomUUID } from "node:crypto";
import { getServiceClient } from "./supabase/server";
import { isDemoMode } from "./env";
import { demo } from "./demo-store";
import type { Source } from "./types";

// 監看來源是 owner 專屬。listSources 無參數版供背景排程（取全部啟用來源 = owner 的）。
export async function listSources(ownerId?: string): Promise<Source[]> {
  if (isDemoMode) return demo.sources;
  const sb = getServiceClient()!;
  let q = sb.from("sources").select("*");
  if (ownerId) q = q.eq("owner_id", ownerId);
  const { data } = await q;
  return (data ?? []) as Source[];
}

export async function createSource(
  input: {
    threads_account_id: string;
    shopee_account_id?: string | null;
    source_username?: string;
    search_query?: string | null;
    poll_interval_minutes?: number;
    auto_publish?: boolean;
    posts_limit?: number;
  },
  ownerId: string
): Promise<Source> {
  const search_query = input.search_query?.trim() || null;
  const row = {
    owner_id: ownerId,
    threads_account_id: input.threads_account_id,
    shopee_account_id: input.shopee_account_id ?? null,
    source_username: (input.source_username ?? "").trim().replace(/^@/, ""),
    search_query,
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

// 啟用／停用來源（回傳是否有命中該 owner 的 row，達成擁有權檢查）
export async function setSourceEnabled(id: string, ownerId: string, enabled: boolean): Promise<boolean> {
  if (isDemoMode) {
    const s = demo.sources.find((x) => x.id === id);
    if (!s) return false;
    s.enabled = enabled;
    return true;
  }
  const sb = getServiceClient()!;
  const { data, error } = await sb
    .from("sources")
    .update({ enabled })
    .eq("id", id)
    .eq("owner_id", ownerId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function deleteSource(id: string, ownerId: string): Promise<boolean> {
  if (isDemoMode) {
    const i = demo.sources.findIndex((x) => x.id === id);
    if (i < 0) return false;
    demo.sources.splice(i, 1);
    return true;
  }
  const sb = getServiceClient()!;
  const { data, error } = await sb
    .from("sources")
    .delete()
    .eq("id", id)
    .eq("owner_id", ownerId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

// 去重：來源貼文是否已處理過
export async function isPostProcessed(sourceId: string, postId: string): Promise<boolean> {
  if (isDemoMode) return demo.drafts.some((d) => d.source_id === sourceId && d.source_post_id === postId);
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

// 批次去重：一次撈出本來源在候選清單中「已處理」的貼文 id 集合（只查候選，避免全表）。
// pipeline 迴圈前預載一次，取代逐篇 isPostProcessed 查詢（消除 N+1）。
export async function listProcessedPostIds(sourceId: string, postIds: string[]): Promise<Set<string>> {
  if (postIds.length === 0) return new Set();
  if (isDemoMode) {
    return new Set(
      demo.drafts
        .filter((d) => d.source_id === sourceId && d.source_post_id && postIds.includes(d.source_post_id))
        .map((d) => d.source_post_id as string)
    );
  }
  const sb = getServiceClient()!;
  const { data } = await sb.from("processed_posts").select("post_id").eq("source_id", sourceId).in("post_id", postIds);
  return new Set((data ?? []).map((r) => r.post_id as string));
}
