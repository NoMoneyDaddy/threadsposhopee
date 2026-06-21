// AI 代理人資料層（ai_agents / ai_agent_seen）。多租戶：一律帶 ownerId 過濾；cron 用 *All 版本。
import { getServiceClient } from "./supabase/server";
import { isDemoMode } from "./env";

export interface AiAgent {
  id: string;
  owner_id: string;
  name: string;
  tone: string;
  domain: string;
  emoji_level: string;
  hashtag_pool: string[];
  length: number;
  source_mode: string;
  rss_feeds: string[];
  search_query: string;
  threads_account_id: string | null;
  use_redirect: boolean;
  enabled: boolean;
  last_run_at: string | null;
}

const COLS =
  "id, owner_id, name, tone, domain, emoji_level, hashtag_pool, length, source_mode, rss_feeds, search_query, threads_account_id, use_redirect, enabled, last_run_at";

export interface AiAgentInput {
  name: string;
  tone?: string;
  domain: string;
  emoji_level?: string;
  hashtag_pool?: string[];
  length?: number;
  source_mode?: string;
  rss_feeds?: string[];
  search_query?: string;
  threads_account_id?: string | null;
  use_redirect?: boolean;
}

export async function listAiAgents(ownerId: string): Promise<AiAgent[]> {
  if (isDemoMode) return [];
  const sb = getServiceClient()!;
  const { data } = await sb.from("ai_agents").select(COLS).eq("owner_id", ownerId).order("created_at", { ascending: false });
  return (data ?? []) as AiAgent[];
}

export async function getAiAgent(id: string, ownerId: string): Promise<AiAgent | null> {
  if (isDemoMode) return null;
  const sb = getServiceClient()!;
  const { data } = await sb.from("ai_agents").select(COLS).eq("id", id).eq("owner_id", ownerId).maybeSingle();
  return (data as AiAgent) ?? null;
}

export async function createAiAgent(ownerId: string, input: AiAgentInput): Promise<AiAgent> {
  if (isDemoMode) throw new Error("demo 模式不支援");
  const sb = getServiceClient()!;
  const { data, error } = await sb
    .from("ai_agents")
    .insert({ owner_id: ownerId, ...input })
    .select(COLS)
    .single();
  if (error) throw new Error(`建立代理人失敗：${error.message}`);
  return data as AiAgent;
}

export async function updateAiAgent(id: string, ownerId: string, patch: Partial<AiAgentInput & { enabled: boolean }>): Promise<void> {
  if (isDemoMode) return;
  const sb = getServiceClient()!;
  const { error } = await sb.from("ai_agents").update(patch).eq("id", id).eq("owner_id", ownerId);
  if (error) throw new Error(`更新代理人失敗：${error.message}`);
}

export async function deleteAiAgent(id: string, ownerId: string): Promise<void> {
  if (isDemoMode) return;
  const sb = getServiceClient()!;
  await sb.from("ai_agents").delete().eq("id", id).eq("owner_id", ownerId);
}

// cron 用：所有 owner 的「已啟用」代理人。
export async function listEnabledAiAgentsAll(): Promise<AiAgent[]> {
  if (isDemoMode) return [];
  const sb = getServiceClient()!;
  const { data } = await sb.from("ai_agents").select(COLS).eq("enabled", true);
  return (data ?? []) as AiAgent[];
}

export async function setAgentLastRun(id: string): Promise<void> {
  if (isDemoMode) return;
  const sb = getServiceClient()!;
  await sb.from("ai_agents").update({ last_run_at: new Date().toISOString() }).eq("id", id);
}

// ── 去重記錄 ──
export async function hasSeen(agentId: string, sourceHash: string): Promise<boolean> {
  if (isDemoMode) return false;
  const sb = getServiceClient()!;
  const { data } = await sb.from("ai_agent_seen").select("source_hash").eq("agent_id", agentId).eq("source_hash", sourceHash).maybeSingle();
  return Boolean(data);
}

export async function markSeen(agentId: string, sourceHash: string, title: string): Promise<void> {
  if (isDemoMode) return;
  const sb = getServiceClient()!;
  await sb.from("ai_agent_seen").upsert({ agent_id: agentId, source_hash: sourceHash, title }, { onConflict: "agent_id,source_hash" });
}

// 近 N 天此代理人已處理過的標題（給標題層相似度去重）。
export async function recentSeenTitles(agentId: string, sinceMs: number): Promise<string[]> {
  if (isDemoMode) return [];
  const sb = getServiceClient()!;
  const sinceIso = new Date(Date.now() - sinceMs).toISOString();
  const { data } = await sb
    .from("ai_agent_seen")
    .select("title")
    .eq("agent_id", agentId)
    .gte("created_at", sinceIso)
    .limit(200);
  return (data ?? []).map((d) => d.title).filter((t): t is string => Boolean(t));
}
