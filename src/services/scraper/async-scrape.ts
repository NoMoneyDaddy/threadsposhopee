// 非同步抓取編排（A+B）：啟動 Apify run（不等跑完）→ 背景 cron／前端輪詢推進 → 完成抓 dataset 入庫。
// 取代 run-sync 300s 硬上限：可長跑（timeout 3600）＋即時進度。入庫共用 processScrapedPosts（與同步路徑一致）。
import { isDemoMode } from "@/lib/env";
import { log } from "@/lib/logger";
import { listSources, getApifyCredentials } from "@/lib/store";
import { startApifyRun, getApifyRunInfo, fetchApifyDatasetPosts, scrapeLatestPosts } from "@/services/scraper/threads";
import { processScrapedPosts, type ScrapeTarget } from "@/services/pipeline/run";
import { createScrapeRun, updateScrapeRun, listActiveScrapeRuns, type ScrapeRun } from "@/lib/scrape-runs";
import type { Source } from "@/lib/types";

function scrapeSpec(source: Source, opts: { after?: string; before?: string }) {
  const after = opts.after ?? source.after_date;
  const before = opts.before ?? source.before_date;
  return source.search_query
    ? { searchQuery: source.search_query, username: source.source_username, sort: source.sort === "top" ? ("top" as const) : ("recent" as const), after, before }
    : { username: source.source_username, after, before };
}

// 啟動本使用者所有啟用來源的非同步抓取，回傳建立的 run 列（前端據此輪詢進度）。
export async function startScrapeRunsForOwner(
  ownerId: string,
  opts: { force?: boolean; after?: string; before?: string } = {}
): Promise<ScrapeRun[]> {
  const sources = (await listSources(ownerId)).filter((s) => s.enabled && (s.search_query || s.source_username));
  if (sources.length === 0) return [];
  const creds = await getApifyCredentials(ownerId);
  const runs: ScrapeRun[] = [];

  for (const s of sources) {
    const spec = scrapeSpec(s, opts);
    const params = { sourceId: s.id, searchQuery: s.search_query, sourceUsername: s.source_username, force: Boolean(opts.force) };
    if (isDemoMode) {
      // demo 無真實 Apify run：直接用 fixtures 同步抓取＋入庫，記一筆已完成的 run（讓 UI/e2e 一致）。
      const posts = await scrapeLatestPosts(spec, s.posts_limit, creds);
      const result = await processScrapedPosts(s, posts, ownerId, { force: opts.force });
      runs.push(
        await createScrapeRun({
          owner_id: ownerId, source_id: s.id, apify_run_id: `demo-${s.id}`, dataset_id: null,
          actor: creds?.actor ?? "demo", status: "done", params, keyword: s.search_query ?? null,
          item_count: posts.length, created_count: result.created
        })
      );
      continue;
    }
    if (!creds?.token) throw new Error("未綁定 Apify token（請到帳號管理綁定你自己的 Apify 金鑰）");
    try {
      const { runId, datasetId, actor } = await startApifyRun(spec, s.posts_limit, creds, 3600);
      runs.push(await createScrapeRun({ owner_id: ownerId, source_id: s.id, apify_run_id: runId, dataset_id: datasetId, actor, status: "running", params, keyword: s.search_query ?? null }));
    } catch (e) {
      // 單一來源啟動失敗不擋其他：記一筆 failed run，附原因。
      log.error("啟動 Apify run 失敗", { ownerId, sourceId: s.id, err: e });
      const row = await createScrapeRun({ owner_id: ownerId, source_id: s.id, apify_run_id: "", dataset_id: null, actor: creds.actor ?? "", status: "failed", params, keyword: s.search_query ?? null });
      const error = e instanceof Error ? e.message : String(e);
      await updateScrapeRun(row.id, { error });
      runs.push({ ...row, status: "failed", error });
    }
  }
  return runs;
}

// 推進單一 run：查 Apify 狀態 → 完成就抓 dataset 入庫、標 done；失敗標 failed；還在跑則不動。
export async function advanceScrapeRun(run: ScrapeRun, token: string): Promise<void> {
  if (run.status !== "running" && run.status !== "ingesting") return;
  if (!run.apify_run_id) {
    await updateScrapeRun(run.id, { status: "failed", error: "無 Apify run id" });
    return;
  }
  let info: { status: string; datasetId: string | null };
  try {
    info = await getApifyRunInfo(run.apify_run_id, token);
  } catch (e) {
    log.warn("查 Apify run 狀態失敗（下輪再試）", { runId: run.id, err: e });
    return; // 暫時查不到：保持狀態，下輪再推進
  }
  // 還在跑（含啟動中、逾時收尾中）→ 不動，等下輪。
  if (info.status === "RUNNING" || info.status === "READY" || info.status === "TIMING-OUT") return;
  if (info.status !== "SUCCEEDED") {
    await updateScrapeRun(run.id, { status: "failed", error: `Apify run 結束狀態：${info.status}` });
    return;
  }
  // SUCCEEDED → 抓 dataset 入庫（共用 processScrapedPosts）。
  await updateScrapeRun(run.id, { status: "ingesting" });
  try {
    const datasetId = run.dataset_id || info.datasetId;
    if (!datasetId) throw new Error("Apify run 無 dataset id");
    const posts = await fetchApifyDatasetPosts(datasetId, token);
    const target: ScrapeTarget = {
      id: run.source_id ?? run.params.sourceId ?? "",
      search_query: run.params.searchQuery ?? null,
      source_username: run.params.sourceUsername ?? ""
    };
    const result = await processScrapedPosts(target, posts, run.owner_id, { force: run.params.force });
    await updateScrapeRun(run.id, { status: "done", item_count: posts.length, created_count: result.created, dataset_id: datasetId });
  } catch (e) {
    await updateScrapeRun(run.id, { status: "failed", error: e instanceof Error ? e.message : String(e) });
  }
}

// 推進「某使用者」目前未完成的 run（前端輪詢狀態端點時呼叫，使用者在看就即時推進）。
export async function advanceOwnerRuns(ownerId: string): Promise<void> {
  if (isDemoMode) return;
  const token = (await getApifyCredentials(ownerId))?.token;
  if (!token) return;
  const active = (await listActiveScrapeRuns(200)).filter((r) => r.owner_id === ownerId);
  for (const run of active) {
    try {
      await advanceScrapeRun(run, token);
    } catch (e) {
      log.warn("推進 owner scrape run 失敗", { runId: run.id, err: e });
    }
  }
}

// 背景 cron：推進所有未完成的 run（跨 owner）。回傳推進筆數。
export async function pollActiveScrapeRuns(limit = 50): Promise<number> {
  if (isDemoMode) return 0;
  const active = await listActiveScrapeRuns(limit);
  if (active.length === 0) return 0;
  const tokenCache = new Map<string, string | null>();
  let advanced = 0;
  for (const run of active) {
    let token = tokenCache.get(run.owner_id);
    if (token === undefined) {
      token = (await getApifyCredentials(run.owner_id))?.token ?? null;
      tokenCache.set(run.owner_id, token);
    }
    if (!token) {
      await updateScrapeRun(run.id, { status: "failed", error: "owner 未綁 Apify token" });
      continue;
    }
    try {
      await advanceScrapeRun(run, token);
      advanced++;
    } catch (e) {
      log.warn("推進 scrape run 失敗", { runId: run.id, err: e });
    }
  }
  return advanced;
}
