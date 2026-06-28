// 端到端流程編排（含素材庫重用）：
// 爬1篇 → 去重 → 抓蝦皮連結 → 還原 → 查素材庫
//   命中且連結有效 → 重用文案/連結/媒體（0 AI token、0 Shopee API）
//   未命中 → 共用 helper 產生素材（換分潤連結＋商品名＋AI 文案＋Cloudinary）
// 產出止於「素材」入庫：不自動建草稿、不自動排程、不自動發文。
// 使用者之後到「素材」頁手動挑選素材轉草稿／發文。觸發一律手動（來源頁「立即抓取」按鈕）。
import { scrapeLatestPosts } from "@/services/scraper/threads";
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
  userOwnsThreadsAccount
} from "@/lib/store";
import { getMediaProvider } from "@/services/media/upload";
import { isMaterialReusable } from "./summary";
import { isDemoMode } from "@/lib/env";
import type { Source } from "@/lib/types";

// owner 的 Shopee 金鑰：一律吃自綁（shopee_accounts），未綁回 null（不再用環境變數）。
async function ownerShopeeCreds(ownerId: string): Promise<{ appId: string; secret: string; subId: string } | null> {
  return getShopeeCredentials(ownerId);
}

export interface PipelineResult {
  sourceId: string;
  sourceUsername: string;
  scanned: number;
  created: number; // 本輪新建的素材數
  skipped: number;
  reusedMaterial: number; // 重用既有素材的次數（省下的 AI/Shopee 呼叫）
  materials: { id: string; productName: string | null }[]; // 本輪新建入庫的素材
  notes: string[];
  error?: string; // 整條來源流程失敗（非單篇略過）時的錯誤訊息，供 cron 告警
}

export async function runSourcePipeline(
  source: Source,
  ownerId: string,
  opts: { deadline?: number } = {}
): Promise<PipelineResult> {
  const result: PipelineResult = {
    sourceId: source.id,
    sourceUsername: source.source_username || (source.search_query ? `🔍 ${source.search_query}` : ""),
    scanned: 0,
    created: 0,
    skipped: 0,
    reusedMaterial: 0,
    materials: [],
    notes: []
  };

  // 子系統憑證一次解析（一律自綁）：Apify（爬蟲）、Shopee（分潤）、Gemini（AI）
  const apify = await getApifyCredentials(ownerId);
  const shopeeCreds = await ownerShopeeCreds(ownerId);
  const geminiKey = await getGeminiKey(ownerId);
  const geminiModel = await resolveGeminiModel(ownerId); // 使用者自選模型（無則 env 預設），整迴圈重用
  const copyPrefs = await getCopyPrefs(ownerId); // 一次取出，整個迴圈重用，避免每篇重查
  // 沒綁 Shopee API 時的後備：用 affiliate_id 自組追蹤連結
  const affiliateId = shopeeCreds ? null : await getShopeeAffiliateId(ownerId);
  // 各人自綁圖床（R2 或 Cloudinary，素材進自己雲端）；一次取出整迴圈重用
  const mediaProvider = await getMediaProvider(ownerId);
  // 時間預算守門（爬取前）：scrape 是本流程最慢的外部呼叫（Apify run-sync 自身上限 60s）。
  // 若剩餘預算已不足以安全跑完一輪 scrape，就不啟動、直接回空結果留待下次，避免打穿 route maxDuration。
  // 註：mid-scrape abort 受 Apify run timeout 約束，故在「啟動前」判斷剩餘 budget 是最務實的保護點。
  const SCRAPE_BUDGET_MS = 15000;
  if (opts.deadline && opts.deadline - Date.now() < SCRAPE_BUDGET_MS) {
    result.notes.push("時間預算不足，這輪略過此來源的爬取（下次再抓）");
    return result;
  }
  // 來源兩種模式：有 search_query → 關鍵字搜尋；否則監看 source_username 帳號。
  // 兩者都填＝在該帳號內搜尋關鍵字（同時帶 searchQuery 與 from）。
  const posts = source.search_query
    ? await scrapeLatestPosts(
        { searchQuery: source.search_query, username: source.source_username, sort: "recent" },
        source.posts_limit,
        apify
      )
    : await scrapeLatestPosts({ username: source.source_username }, source.posts_limit, apify);
  result.scanned = posts.length;
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
      if (processedIds.has(post.postId)) {
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

      // 查素材庫：命中且連結有效且有文案 → 重用（省 token / API），不重複入庫。
      const existing = await findMaterial(expanded.shopId, expanded.itemId, ownerId);
      if (isMaterialReusable(existing)) {
        result.reusedMaterial++;
        result.notes.push(`商品 ${expanded.itemId} 已有有效素材，略過（未燒 token）`);
        await markPostProcessed(source.id, post.postId);
        continue;
      }
      // 未命中／素材失效 → 產生（或更新）素材入庫；止於此，不建草稿、不排程、不發文。
      const material = await buildMaterialForProduct(
        {
          shopId: expanded.shopId,
          itemId: expanded.itemId,
          cleanUrl: expanded.cleanUrl,
          originalShortLink: post.shopeeLinks[0],
          mediaList: post.media,
          sourceText: post.text,
          // 關鍵字模式 source_username 可能為空，改用貼文作者當 subId 追蹤標籤
          subIdTag: post.username || source.source_username || "search",
          withCopy: true
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
  opts: { sources?: Source[]; deadline?: number } = {}
): Promise<PipelineResult[]> {
  const sources = (opts.sources ?? (await listSources(ownerId))).filter((s) => s.enabled);
  const results: PipelineResult[] = [];
  for (const s of sources) {
    if (opts.deadline && Date.now() > opts.deadline) break; // 時間預算用盡，剩餘下輪再跑
    // 多租戶越權防護：建草稿前驗證來源綁定的 Threads 帳號確實屬於本人（擋錯綁/污染來源跨租戶寫入）。
    if (!isDemoMode && !(await userOwnsThreadsAccount(s.threads_account_id, ownerId))) {
      log.warn("來源 Threads 帳號歸屬驗證失敗，略過", { ownerId, sourceId: s.id });
      continue;
    }
    // 單一來源拋錯不該中斷整批後續來源（fail-isolation，對齊 cron/all 的 allSettled 精神）。
    try {
      results.push(await runSourcePipeline(s, ownerId, { deadline: opts.deadline }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.error("來源爬取流程失敗", { ownerId, sourceId: s.id, sourceUsername: s.source_username, err: msg });
      results.push({
        sourceId: s.id,
        sourceUsername: s.source_username || (s.search_query ? `🔍 ${s.search_query}` : ""),
        scanned: 0,
        created: 0,
        skipped: 0,
        reusedMaterial: 0,
        materials: [],
        notes: [`來源流程失敗：${msg}`],
        error: msg
      });
    }
  }
  // 個人通知：本輪新入庫的素材 → 提醒 owner 去素材頁挑選轉草稿／發文。
  const newMaterials = results.reduce((n, r) => n + r.materials.length, 0);
  if (newMaterials > 0) {
    // 不沿用 draft_pending 類型（避免被「草稿待審」偏好關閉而誤靜音）；素材入庫提醒一律送出。
    await sendUserAlert(ownerId, `🧱 已入庫 ${newMaterials} 則素材（含更新既有），到「素材」頁挑選即可一鍵轉貼文。`).catch(() => {});
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
