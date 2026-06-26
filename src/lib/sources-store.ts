// 監看來源資料層（owner 專屬）＋來源貼文去重。由 store.ts 拆出（God File 漸進拆分）。
import { randomUUID } from "node:crypto";
import { getServiceClient } from "./supabase/server";
import { isDemoMode } from "./env";
import { demo } from "./demo-store";
import type { Source } from "./types";

// 單一使用者的來源（面向使用者路徑一律帶 ownerId 做多租戶過濾）。
export async function listSources(ownerId: string): Promise<Source[]> {
  if (isDemoMode) return demo.sources;
  const sb = getServiceClient()!;
  const { data } = await sb.from("sources").select("*").eq("owner_id", ownerId);
  return (data ?? []) as Source[];
}

// 僅供背景總排程：跨租戶取「全部啟用」來源（明確命名，避免在面向使用者路徑誤用無 owner 過濾的查詢）。
export async function listAllEnabledSources(): Promise<Source[]> {
  if (isDemoMode) return demo.sources.filter((s) => s.enabled);
  const sb = getServiceClient()!;
  const { data } = await sb.from("sources").select("*").eq("enabled", true);
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

// 取單一來源（多租戶：以 owner_id 過濾）。供 API 在切 auto_publish 前驗證綁定的發文帳號。
export async function getSource(id: string, ownerId: string): Promise<Source | null> {
  if (isDemoMode) return demo.sources.find((s) => s.id === id && s.owner_id === ownerId) ?? null;
  const sb = getServiceClient()!;
  const { data, error } = await sb.from("sources").select("*").eq("id", id).eq("owner_id", ownerId).maybeSingle();
  if (error) throw error; // 查詢異常勿吞成 null（否則會被誤判成「找不到來源」）
  return (data as Source) ?? null;
}

// 切換來源「免審直接排程」（opt-in）。多租戶：以 owner_id 過濾，只動得到自己的列。
export async function setSourceAutoPublish(id: string, ownerId: string, autoPublish: boolean): Promise<boolean> {
  if (isDemoMode) {
    const s = demo.sources.find((x) => x.id === id && x.owner_id === ownerId);
    if (!s) return false;
    s.auto_publish = autoPublish;
    return true;
  }
  const sb = getServiceClient()!;
  const { data, error } = await sb
    .from("sources")
    .update({ auto_publish: autoPublish })
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
