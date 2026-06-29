// 非同步抓取的 run 紀錄層（scrape_runs 表）：啟動後存 run_id/狀態，前端輪詢即時進度、背景 cron 完成後入庫。
import { getServiceClient } from "./supabase/server";
import { isDemoMode } from "./env";

export type ScrapeRunStatus = "running" | "ingesting" | "done" | "failed";

export interface ScrapeRun {
  id: string;
  owner_id: string;
  source_id: string | null;
  apify_run_id: string;
  dataset_id: string | null;
  actor: string;
  status: ScrapeRunStatus;
  // 入庫時用的快照（不依賴當下來源設定已變）：sourceId/keyword/username。
  params: { sourceId?: string; searchQuery?: string | null; sourceUsername?: string | null; force?: boolean };
  keyword: string | null;
  item_count: number | null;
  created_count: number | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

// Demo 模式記憶體儲存（同進程內持久，免 DB）。
const demoRuns: ScrapeRun[] = [];

export interface NewScrapeRun {
  owner_id: string;
  source_id: string | null;
  apify_run_id: string;
  dataset_id: string | null;
  actor: string;
  status?: ScrapeRunStatus;
  params?: ScrapeRun["params"];
  keyword?: string | null;
  item_count?: number | null;
  created_count?: number | null;
}

export async function createScrapeRun(input: NewScrapeRun): Promise<ScrapeRun> {
  const now = new Date().toISOString();
  if (isDemoMode) {
    const row: ScrapeRun = {
      id: `demo-${demoRuns.length + 1}-${input.apify_run_id}`,
      owner_id: input.owner_id,
      source_id: input.source_id,
      apify_run_id: input.apify_run_id,
      dataset_id: input.dataset_id,
      actor: input.actor,
      status: input.status ?? "running",
      params: input.params ?? {},
      keyword: input.keyword ?? null,
      item_count: input.item_count ?? null,
      created_count: input.created_count ?? null,
      error: null,
      created_at: now,
      updated_at: now
    };
    demoRuns.unshift(row);
    return row;
  }
  const sb = getServiceClient()!;
  const { data, error } = await sb
    .from("scrape_runs")
    .insert({
      owner_id: input.owner_id,
      source_id: input.source_id,
      apify_run_id: input.apify_run_id,
      dataset_id: input.dataset_id,
      actor: input.actor,
      status: input.status ?? "running",
      params: input.params ?? {},
      keyword: input.keyword ?? null,
      item_count: input.item_count ?? null,
      created_count: input.created_count ?? null
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as ScrapeRun;
}

export async function updateScrapeRun(id: string, patch: Partial<Pick<ScrapeRun, "status" | "dataset_id" | "item_count" | "created_count" | "error">>): Promise<void> {
  if (isDemoMode) {
    const r = demoRuns.find((x) => x.id === id);
    if (r) Object.assign(r, patch, { updated_at: new Date().toISOString() });
    return;
  }
  const sb = getServiceClient()!;
  const { error } = await sb.from("scrape_runs").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

// owner 最近的 run（前端列表／即時進度）。
export async function listRecentScrapeRuns(ownerId: string, limit = 20): Promise<ScrapeRun[]> {
  if (isDemoMode) return demoRuns.filter((r) => r.owner_id === ownerId).slice(0, limit);
  const sb = getServiceClient()!;
  const { data } = await sb.from("scrape_runs").select("*").eq("owner_id", ownerId).order("created_at", { ascending: false }).limit(limit);
  return (data as ScrapeRun[]) ?? [];
}

// 背景 cron 撈未完成的 run 推進（跨 owner）。
export async function listActiveScrapeRuns(limit = 50): Promise<ScrapeRun[]> {
  if (isDemoMode) return demoRuns.filter((r) => r.status === "running" || r.status === "ingesting").slice(0, limit);
  const sb = getServiceClient()!;
  const { data } = await sb.from("scrape_runs").select("*").in("status", ["running", "ingesting"]).order("created_at", { ascending: true }).limit(limit);
  return (data as ScrapeRun[]) ?? [];
}
