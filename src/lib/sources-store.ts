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
    threads_account_id?: string | null; // 關鍵字抓文來源不綁發文帳號＝null
    shopee_account_id?: string | null;
    source_username?: string;
    search_query?: string | null;
    poll_interval_minutes?: number;
    auto_publish?: boolean;
    posts_limit?: number;
    enabled?: boolean;
    sort?: "top" | "recent" | null;
    after_date?: string | null;
    before_date?: string | null;
  },
  ownerId: string
): Promise<Source> {
  const search_query = input.search_query?.trim() || null;
  const row = {
    owner_id: ownerId,
    threads_account_id: input.threads_account_id ?? null,
    shopee_account_id: input.shopee_account_id ?? null,
    source_username: (input.source_username ?? "").trim().replace(/^@/, ""),
    search_query,
    enabled: input.enabled ?? true,
    poll_interval_minutes: input.poll_interval_minutes ?? 15,
    auto_publish: input.auto_publish ?? false,
    posts_limit: input.posts_limit ?? 1,
    sort: input.sort ?? null,
    after_date: input.after_date || null,
    before_date: input.before_date || null
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

// ── 自動抓文設定（一份可保存的設定）─────────────────────────────
// 實作上以「關鍵字來源列」承載（search_query 有值、threads_account_id 為 null＝不綁發文帳號），
// 以重用既有抓取 pipeline 與貼文去重（processed_posts FK→sources）。對使用者呈現為單一設定。
// 只管「關鍵字抓文來源」(threads_account_id 為 null)；不動到舊的「綁帳號監看來源」。
function isScrapeSource(s: Source): boolean {
  return !s.threads_account_id && Boolean(s.search_query);
}

// 抓文設定（一份共用設定，整份寫到每個關鍵字來源列）。
export interface ScrapeConfigData {
  keywords: string[];
  postsLimit: number;
  username: string; // 目標帳號（選填，無預設）
  sort: "top" | "recent";
  after: string; // YYYY-MM-DD，空＝不限
  before: string; // YYYY-MM-DD，空＝不限
  enabled: boolean;
}

// 讀目前的抓文設定：關鍵字清單（保序）＋每次抓幾篇＋目標帳號＋排序＋日期區間＋是否啟用。下次開頁自動帶出（保留上次設定）。
export async function getScrapeConfig(ownerId: string): Promise<ScrapeConfigData> {
  const sources = (await listSources(ownerId)).filter(isScrapeSource);
  const keywords = sources.map((s) => (s.search_query ?? "").trim()).filter(Boolean);
  const postsLimit = sources[0]?.posts_limit ?? 3;
  // 排序／日期／目標帳號是整份設定共用一個值（同寫到每個關鍵字來源列）；取第一個即可。
  const username = (sources[0]?.source_username ?? "").trim();
  const sort: "top" | "recent" = sources[0]?.sort === "top" ? "top" : "recent";
  const after = (sources[0]?.after_date ?? "").trim();
  const before = (sources[0]?.before_date ?? "").trim();
  // 尚未設定任何關鍵字時預設「啟用」，讓首次儲存就會被「立即抓取」納入；已有來源則看其啟用狀態。
  const enabled = sources.length === 0 ? true : sources.some((s) => s.enabled);
  return { keywords, postsLimit, username, sort, after, before, enabled };
}

// 保存抓文設定：把關鍵字清單對帳成關鍵字來源列（新增缺的、刪除移除的、更新保留的）。
// 各欄位已由呼叫端正規化（關鍵字去重/上限、帳號與日期字元驗證、排序枚舉）。回傳保存後的設定。
// 排序／日期／目標帳號為整份共用值，寫到每個關鍵字來源列。
export async function saveScrapeConfig(ownerId: string, cfg: ScrapeConfigData): Promise<ScrapeConfigData> {
  const { keywords, postsLimit, username, sort, after, before, enabled } = cfg;
  const existing = (await listSources(ownerId)).filter(isScrapeSource);
  const existingByKw = new Map(existing.map((s) => [(s.search_query ?? "").trim(), s]));
  const wanted = new Set(keywords);
  const shared = { posts_limit: postsLimit, source_username: username, sort, after_date: after, before_date: before, enabled };

  // 各列獨立，平行處理（最多 10 個關鍵字，省去逐筆 DB 往返）：刪除移除的、新增缺的、更新保留的。
  await Promise.all([
    ...existing
      .filter((s) => !wanted.has((s.search_query ?? "").trim()))
      .map((s) => deleteSource(s.id, ownerId)),
    ...keywords
      .filter((kw) => !existingByKw.has(kw))
      .map((kw) => createSource({ threads_account_id: null, search_query: kw, auto_publish: false, ...shared }, ownerId)),
    ...existing
      .filter((s) => wanted.has((s.search_query ?? "").trim()))
      .map((s) => updateScrapeSource(s.id, ownerId, shared))
  ]);
  return cfg;
}

// 內部：更新關鍵字來源共用欄位（posts_limit / source_username / sort / 日期 / enabled）（多租戶以 owner_id 過濾）。
async function updateScrapeSource(
  id: string,
  ownerId: string,
  patch: { posts_limit?: number; source_username?: string; sort?: "top" | "recent"; after_date?: string; before_date?: string; enabled?: boolean }
): Promise<void> {
  if (isDemoMode) {
    const s = demo.sources.find((x) => x.id === id && x.owner_id === ownerId);
    if (s) Object.assign(s, patch);
    return;
  }
  const sb = getServiceClient()!;
  const { error } = await sb.from("sources").update(patch).eq("id", id).eq("owner_id", ownerId);
  if (error) throw error; // 更新失敗勿靜默吞掉（否則呼叫端誤以為已存檔），對齊本檔其他寫入函式
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
