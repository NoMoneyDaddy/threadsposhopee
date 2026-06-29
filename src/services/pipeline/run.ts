// 端到端流程編排（含素材庫重用）：
// 爬1篇 → 去重 → 抓蝦皮連結 → 還原 → 查素材庫
//   命中且連結有效 → 重用文案/連結/媒體（0 AI token、0 Shopee API）
//   未命中 → 共用 helper 產生素材（換分潤連結＋商品名＋AI 文案＋Cloudinary）
// 產出止於「素材」入庫：不自動建草稿、不自動排程、不自動發文。
// 使用者之後到「素材」頁手動挑選素材轉草稿／發文。觸發一律手動（來源頁「立即抓取」按鈕）。
import { scrapeLatestPosts, type ScrapedPost } from "@/services/scraper/threads";
import { expandShopeeLink } from "@/services/shopee/expand";
import { buildMaterialForProduct } from "@/services/materials/build";
import { log } from "@/lib/logger";
import { sendUserAlert } from "@/lib/notify";
import { getOwnerUserId } from "@/lib/auth";
import {
  markPostProcessed,
  listProcessedPostIds,
  listSources,
  listAllEnabledSources,
  findMaterial,
  getApifyCredentials,
  getShopeeCredentials,
  getGeminiKey,
  resolveGeminiModel,
  getCopyPrefs,
  getShopeeAffiliateId,
  getShopeeSubId,
  userOwnsThreadsAccount
} from "@/lib/store";
import { getMediaProvider } from "@/services/media/upload";
import { isMaterialCaptured, decideIntakeStatus } from "./summary";
import { isDemoMode } from "@/lib/env";
import type { Source } from "@/lib/types";

// owner 的 Shopee 金鑰：一律吃自綁（shopee_accounts），未綁回 null（不再用環境變數）。
async function ownerShopeeCreds(ownerId: string): Promise<{ appId: string; secret: string; subId: string } | null> {
  return getShopeeCredentials(ownerId);
}

export interface PipelineResult {
  sourceId: string;
  sourceUsername: string;
  keyword: string; // 此來源的搜尋關鍵字（關鍵字抓文用；空＝純監看帳號）。供結果面板顯示。
  scanned: number;
  created: number; // 本輪新產生/更新的素材數（含已核准重產）
  pending: number; // 本輪「進入待審」的素材數（不含已核准重產）；通知/摘要的待審數以此為準
  skipped: number;
  reusedMaterial: number; // 重用既有素材的次數（省下的 AI/Shopee 呼叫）
  materials: { id: string; productName: string | null }[]; // 本輪新產生/更新的素材
  notes: string[];
  error?: string; // 整條來源流程失敗（非單篇略過）時的錯誤訊息，供 cron 告警
}

export async function runSourcePipeline(
  source: Source,
  ownerId: string,
  // force=true：忽略「已抓過去重」與「已有有效素材」兩道略過，強制重新處理本來源貼文
  // （改了設定/換 actor 後想重抓，免手動清 processed_posts）。
  opts: { deadline?: number; force?: boolean } = {}
): Promise<PipelineResult> {
  // 時間預算守門（爬取前）：scrape 是本流程最慢的外部呼叫（同步 run-sync 受自身上限約束）。
  // 剩餘預算不足以安全跑完一輪 scrape 就略過、留待下次，避免打穿 route maxDuration。
  const SCRAPE_BUDGET_MS = 15000;
  if (opts.deadline && opts.deadline - Date.now() < SCRAPE_BUDGET_MS) {
    return { ...emptyResult(source), notes: ["時間預算不足，這輪略過此來源的爬取（下次再抓）"] };
  }
  const apify = await getApifyCredentials(ownerId);
  // 來源兩種模式：有 search_query → 關鍵字搜尋；否則監看 source_username 帳號。
  // 兩者都填＝在該帳號內搜尋關鍵字（同時帶 searchQuery 與 from）。
  const posts = source.search_query
    ? await scrapeLatestPosts(
        {
          searchQuery: source.search_query,
          username: source.source_username,
          sort: source.sort === "top" ? "top" : "recent",
          after: source.after_date,
          before: source.before_date
        },
        source.posts_limit,
        apify
      )
    : await scrapeLatestPosts({ username: source.source_username }, source.posts_limit, apify);
  // 抓到後立即處理入庫。與非同步路徑（Apify run 完成後抓 dataset）共用 processScrapedPosts。
  return processScrapedPosts(source, posts, ownerId, opts);
}

// 入庫只需來源的這幾個欄位（id 用於去重/標記、search_query/username 用於標籤與 subId 範本）。
// 非同步路徑用快照重建即可，不必整個 Source。
export type ScrapeTarget = Pick<Source, "id" | "search_query" | "source_username">;

// 空結果骨架（時間預算不足等早退、或處理前初始化）。
function emptyResult(source: ScrapeTarget): PipelineResult {
  return {
    sourceId: source.id,
    sourceUsername: source.source_username || (source.search_query ? source.search_query : ""),
    keyword: source.search_query ?? "",
    scanned: 0,
    created: 0,
    pending: 0,
    skipped: 0,
    reusedMaterial: 0,
    materials: [],
    notes: []
  };
}

// 把抓到的貼文處理成素材（去重→抓蝦皮連結→還原→查素材庫→建/更新待審素材）。
// 同步（run-sync）與非同步（Apify run 完成後抓 dataset）兩路徑共用＝單一入庫邏輯，避免行為漂移。
export async function processScrapedPosts(
  source: ScrapeTarget,
  posts: ScrapedPost[],
  ownerId: string,
  // force=true：忽略「已抓過去重」與「已有有效素材」兩道略過，強制重新處理本來源貼文。
  opts: { deadline?: number; force?: boolean } = {}
): Promise<PipelineResult> {
  const result = emptyResult(source);
  result.scanned = posts.length;
  // 子系統憑證一次解析（一律自綁）：Shopee（分潤）、Gemini（AI）、圖床、Sub id 範本。整迴圈重用。
  const shopeeCreds = await ownerShopeeCreds(ownerId);
  const geminiKey = await getGeminiKey(ownerId);
  const geminiModel = await resolveGeminiModel(ownerId);
  const copyPrefs = await getCopyPrefs(ownerId);
  // 選填設定讀取失敗降級 null 繼續跑（不讓暫時性 DB 錯誤中止整條流程）。
  const customSubId = await getShopeeSubId(ownerId).catch(() => null);
  const affiliateId = shopeeCreds ? null : await getShopeeAffiliateId(ownerId);
  const mediaProvider = await getMediaProvider(ownerId);

  // 一次預載本來源已處理的貼文 id（取代逐篇 isPostProcessed 查詢，消除 N+1）
  const processedIds = await listProcessedPostIds(
    source.id,
    posts.map((p) => p.postId)
  );

  for (const post of posts) {
    // 時間預算：逐篇前檢查，超過即停手（守 /api/pipeline/run 的 maxDuration，單一來源也不會跑爆）。
    if (opts.deadline && Date.now() > opts.deadline) {
      result.notes.push("時間預算用盡，剩餘貼文下次再抓");
      break;
    }
    // 註：搜尋爬蟲的「2/2 留言」常才是帶蝦皮連結的那篇，故不再略過 isReply；
    // 沒有蝦皮連結的貼文會在下方被略過。

    // 單篇容錯：任一外部 API 失敗只略過該篇，不中斷整條流程
    try {
      if (!opts.force && processedIds.has(post.postId)) {
        result.skipped++;
        continue;
      }
      if (post.shopeeLinks.length === 0) {
        result.notes.push(`貼文 ${post.postId} 沒有蝦皮連結，略過`);
        await markPostProcessed(source.id, post.postId);
        continue;
      }

      const expanded = await expandShopeeLink(post.shopeeLinks[0]);
      if (!expanded) {
        result.notes.push(`貼文 ${post.postId} 連結無法解析商品 id`);
        continue;
      }

      // 查素材庫：已捕捉過此商品（連結有效）→ 略過，不重建（省 token / Shopee API / 圖床）。
      const existing = await findMaterial(expanded.shopId, expanded.itemId, ownerId);
      if (!opts.force && isMaterialCaptured(existing)) {
        result.reusedMaterial++;
        result.notes.push(`商品 ${expanded.itemId} 已有有效素材，略過（未重建）`);
        await markPostProcessed(source.id, post.postId);
        continue;
      }
      // 未命中／素材失效 → 產生（或更新）素材，進「待審」由人工逐筆核准才入庫；不建草稿、不排程、不發文。
      // 入庫狀態決策（純函式 decideIntakeStatus）：新建→pending；既有已核准（含舊資料 null）→ 保留 approved
      // 不降級；既有待審→維持 pending。
      const intakeStatus = decideIntakeStatus(existing);
      const material = await buildMaterialForProduct(
        {
          shopId: expanded.shopId,
          itemId: expanded.itemId,
          cleanUrl: expanded.cleanUrl,
          originalShortLink: post.shopeeLinks[0],
          mediaList: post.media,
          sourceText: post.text,
          // 分潤 Sub id 一律用使用者設定（範本），與手動建立／贊助文一致；不再自動硬塞作者帳號＋itemId。
          // subIdTag 僅供範本 {account} 變數代換（關鍵字模式 source_username 可能為空，退回貼文作者）。
          customSubId,
          subIdTag: post.username || source.source_username || "search",
          // 抓素材只取商品 ID／名稱／媒體＋換分潤連結，不在這裡生成文案（不燒 Gemini、抓取才快）。
          // 文案改到「排一篇」轉草稿時才生成（repost 流程；素材無文案會即時補生）。
          withCopy: false,
          intakeStatus
        },
        ownerId,
        shopeeCreds,
        result.notes,
        geminiKey,
        copyPrefs,
        affiliateId,
        mediaProvider,
        geminiModel
      );

      await markPostProcessed(source.id, post.postId);
      result.created++;
      if (intakeStatus === "pending") result.pending++; // 只有真正進待審的才計入待審數
      result.materials.push({ id: material.id, productName: material.product_name ?? null });
    } catch (e) {
      result.notes.push(`貼文 ${post.postId} 處理失敗：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return result;
}

// 跑所有啟用中的來源（給排程 / 手動觸發用）。爬蟲是 owner 專屬，產出掛在 owner 名下。
// 跑「單一使用者」的所有啟用來源（手動觸發、或總排程逐使用者呼叫）。
// 多租戶：用該使用者自己的憑證，草稿掛在其名下。
// opts.sources：總排程已在記憶體分組好時傳入，省去重複 DB 查詢（避免 N+1）。
// opts.deadline：時間預算（epoch ms），逐來源前檢查，超過即停手留待下輪（守 cron maxDuration）。
export async function runSourcesForOwner(
  ownerId: string,
  opts: { sources?: Source[]; deadline?: number; force?: boolean } = {}
): Promise<PipelineResult[]> {
  const sources = (opts.sources ?? (await listSources(ownerId))).filter((s) => s.enabled);
  const results: PipelineResult[] = [];
  for (const s of sources) {
    if (opts.deadline && Date.now() > opts.deadline) break; // 時間預算用盡，剩餘下輪再跑
    // 多租戶越權防護：僅「綁了發文帳號」的舊式監看來源需驗證帳號歸屬；關鍵字抓文來源不綁帳號
    // （threads_account_id 為 null）＝只產待審素材、不發文，故無需此檢查。
    if (s.threads_account_id && !isDemoMode && !(await userOwnsThreadsAccount(s.threads_account_id, ownerId))) {
      log.warn("來源 Threads 帳號歸屬驗證失敗，略過", { ownerId, sourceId: s.id });
      continue;
    }
    // 單一來源拋錯不該中斷整批後續來源（fail-isolation，對齊 cron/all 的 allSettled 精神）。
    try {
      results.push(await runSourcePipeline(s, ownerId, { deadline: opts.deadline, force: opts.force }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.error("來源爬取流程失敗", { ownerId, sourceId: s.id, sourceUsername: s.source_username, err: msg });
      results.push({
        sourceId: s.id,
        sourceUsername: s.source_username || (s.search_query ? s.search_query : ""),
        keyword: s.search_query ?? "",
        scanned: 0,
        created: 0,
        pending: 0,
        skipped: 0,
        reusedMaterial: 0,
        materials: [],
        notes: [`來源流程失敗：${msg}`],
        error: msg
      });
    }
  }
  // 個人通知：本輪「實際進待審」的素材數（不含已核准重產）→ 提醒 owner 去素材頁逐筆核准入庫。
  const newPending = results.reduce((n, r) => n + r.pending, 0);
  if (newPending > 0) {
    // 不沿用 draft_pending 類型（避免被「草稿待審」偏好關閉而誤靜音）；素材待審提醒一律送出。
    await sendUserAlert(ownerId, `🔎 抓到 ${newPending} 則新素材待審，到「素材」頁逐筆確認入庫。`).catch(() => {});
  }
  return results;
}

// 自動抓文為平台管理員專屬：背景排程只跑平台管理員名下的啟用來源。
// 一次撈全部啟用來源、記憶體依 owner 分組（免 N+1），但只處理平台管理員（其餘為舊版殘留的孤兒來源，
// 政策改動後使用者已無法自行停用/刪除，故在此一律不跑，避免持續產生草稿/外部成本）。
// 時間預算守 cron maxDuration，傳入 runSourcesForOwner 連單一 owner 內也會中途停手。
export async function runAllSources(): Promise<PipelineResult[]> {
  if (isDemoMode) return runSourcesForOwner((await getOwnerUserId()) ?? "demo-user");
  const platformOwnerId = await getOwnerUserId();
  if (!platformOwnerId) return []; // 無法解析平台管理員 → 不跑任何來源（不誤跑孤兒來源）
  const start = Date.now();
  const deadline = start + 50000;
  // 記憶體分組：owner_id -> 其啟用來源（只保留平台管理員，孤兒來源略過）
  const byOwner = new Map<string, Source[]>();
  for (const s of await listAllEnabledSources()) {
    if (s.owner_id !== platformOwnerId) continue;
    const arr = byOwner.get(s.owner_id) ?? [];
    arr.push(s);
    byOwner.set(s.owner_id, arr);
  }
  const results: PipelineResult[] = [];
  for (const ownerId of byOwner.keys()) {
    if (Date.now() > deadline) break; // 守 maxDuration
    if (!(await getApifyCredentials(ownerId))) continue; // 未綁 Apify 金鑰略過
    results.push(...(await runSourcesForOwner(ownerId, { sources: byOwner.get(ownerId), deadline })));
  }
  return results;
}
