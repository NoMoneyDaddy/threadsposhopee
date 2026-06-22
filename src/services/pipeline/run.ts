// 端到端流程編排（含素材庫重用）：
// 爬1篇 → 去重 → 抓蝦皮連結 → 還原 → 查素材庫
//   命中且連結有效 → 重用文案/連結/媒體（0 AI token、0 Shopee API）
//   未命中 → 共用 helper 產生素材（換分潤連結＋商品名＋AI 文案＋Cloudinary）
// → 從素材產生草稿。auto_publish 來源直接 approved 進發文佇列。
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
  createDraftFromMaterial,
  getApifyCredentials,
  getShopeeCredentials,
  getGeminiKey,
  getCopyPrefs,
  getShopeeAffiliateId,
  userOwnsThreadsAccount
} from "@/lib/store";
import { getMediaProvider } from "@/services/media/upload";
import { autoScheduleApproved } from "@/services/publish/auto-schedule";
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
  created: number;
  skipped: number;
  reusedMaterial: number; // 重用素材的次數（省下的 AI/Shopee 呼叫）
  drafts: { id: string; productName: string | null }[];
  notes: string[];
  error?: string; // 整條來源流程失敗（非單篇略過）時的錯誤訊息，供 cron 告警
}

export async function runSourcePipeline(source: Source, ownerId: string): Promise<PipelineResult> {
  const result: PipelineResult = {
    sourceId: source.id,
    sourceUsername: source.source_username || (source.search_query ? `🔍 ${source.search_query}` : ""),
    scanned: 0,
    created: 0,
    skipped: 0,
    reusedMaterial: 0,
    drafts: [],
    notes: []
  };

  // 子系統憑證一次解析（一律自綁）：Apify（爬蟲）、Shopee（分潤）、Gemini（AI）
  const apify = await getApifyCredentials(ownerId);
  const shopeeCreds = await ownerShopeeCreds(ownerId);
  const geminiKey = await getGeminiKey(ownerId);
  const copyPrefs = await getCopyPrefs(ownerId); // 一次取出，整個迴圈重用，避免每篇重查
  // 沒綁 Shopee API 時的後備：用 affiliate_id 自組追蹤連結
  const affiliateId = shopeeCreds ? null : await getShopeeAffiliateId(ownerId);
  // 各人自綁圖床（R2 或 Cloudinary，素材進自己雲端）；一次取出整迴圈重用
  const mediaProvider = await getMediaProvider(ownerId);
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

      // 查素材庫：命中且連結有效且有文案 → 重用（省 token / API）
      let material = await findMaterial(expanded.shopId, expanded.itemId, ownerId);
      if (material && material.affiliate_valid && material.main_text && material.affiliate_short_link) {
        result.reusedMaterial++;
        result.notes.push(`商品 ${expanded.itemId} 重用既有素材（未燒 token）`);
      } else {
        material = await buildMaterialForProduct(
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
          mediaProvider
        );
      }

      const base = {
        owner_id: ownerId,
        source_id: source.id,
        threads_account_id: source.threads_account_id,
        source_post_id: post.postId
      } as const;
      // 預設：待人工核准（只有審核過的草稿才會發布）。
      // 來源開啟「免審直接排程」時：自動排進下一個空時段並標記已核准；無空檔則退回待審草稿保底。
      let draft = source.auto_publish
        ? await autoScheduleApproved(ownerId, (slot) =>
            createDraftFromMaterial(material, { ...base, status: "approved", scheduled_at: slot })
          )
        : null;
      if (!draft) draft = await createDraftFromMaterial(material, { ...base, status: "draft" });

      await markPostProcessed(source.id, post.postId);
      result.created++;
      result.drafts.push({ id: draft.id, productName: material.product_name ?? null });
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
      results.push(await runSourcePipeline(s, ownerId));
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
        drafts: [],
        notes: [`來源流程失敗：${msg}`],
        error: msg
      });
    }
  }
  // 個人通知：本輪新產生的草稿待審（爬蟲掛在 owner 名下）→ 提醒 owner 去核准。
  const newDrafts = results.reduce((n, r) => n + r.drafts.length, 0);
  if (newDrafts > 0) {
    await sendUserAlert(ownerId, `📝 有 ${newDrafts} 則新文案（待審或已自動排程，依來源設定），詳見草稿頁。`, "draft_pending").catch(() => {});
  }
  return results;
}

// 所有租戶：一次撈全部啟用來源、記憶體依 owner 分組（免 N+1），只跑「有綁自己 Apify 金鑰」的使用者。
// 公平性：owner 順序隨機打亂，避免排前面的長時間來源每輪吃光預算、導致後面的人永遠輪不到（飢餓）。
// 時間預算守 cron maxDuration，傳入 runSourcesForOwner 連單一 owner 內也會中途停手。
export async function runAllSources(): Promise<PipelineResult[]> {
  if (isDemoMode) return runSourcesForOwner((await getOwnerUserId()) ?? "demo-user");
  const start = Date.now();
  const deadline = start + 50000;
  // 記憶體分組：owner_id -> 其啟用來源
  const byOwner = new Map<string, Source[]>();
  for (const s of await listAllEnabledSources()) {
    if (!s.owner_id) continue;
    const arr = byOwner.get(s.owner_id) ?? [];
    arr.push(s);
    byOwner.set(s.owner_id, arr);
  }
  const owners = Array.from(byOwner.keys()).sort(() => Math.random() - 0.5); // 公平隨機
  const results: PipelineResult[] = [];
  for (const ownerId of owners) {
    if (Date.now() > deadline) break; // 守 maxDuration，剩餘 owner 下輪再跑
    if (!(await getApifyCredentials(ownerId))) continue; // 沒綁自己 Apify 金鑰的使用者略過
    results.push(...(await runSourcesForOwner(ownerId, { sources: byOwner.get(ownerId), deadline })));
  }
  return results;
}
