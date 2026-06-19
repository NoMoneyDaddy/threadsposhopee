// 端到端流程編排（含素材庫重用）：
// 爬1篇 → 去重 → 抓蝦皮連結 → 還原 → 查素材庫
//   命中且連結有效 → 重用文案/連結/媒體（0 AI token、0 Shopee API）
//   未命中 → 共用 helper 產生素材（換分潤連結＋商品名＋AI 文案＋Cloudinary）
// → 從素材產生草稿。auto_publish 來源直接 approved 進發文佇列。
import { scrapeLatestPosts } from "@/services/scraper/threads";
import { expandShopeeLink } from "@/services/shopee/expand";
import { buildMaterialForProduct } from "@/services/materials/build";
import { env } from "@/lib/env";
import { getOwnerUserId } from "@/lib/auth";
import {
  isPostProcessed,
  markPostProcessed,
  listSources,
  findMaterial,
  createDraftFromMaterial,
  getApifyCredentials,
  getShopeeCredentials,
  getGeminiKey,
  getCopyPrefs
} from "@/lib/store";
import type { Source } from "@/lib/types";

// owner 的 Shopee 金鑰：優先自綁（shopee_accounts），沒綁退回環境變數
async function ownerShopeeCreds(ownerId: string): Promise<{ appId: string; secret: string; subId: string } | null> {
  const bound = await getShopeeCredentials(ownerId);
  if (bound) return bound;
  if (env.shopeeAppId && env.shopeeSecret) {
    return { appId: env.shopeeAppId, secret: env.shopeeSecret, subId: env.shopeeDefaultSubId };
  }
  return null;
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
}

export async function runSourcePipeline(source: Source, ownerId: string): Promise<PipelineResult> {
  const result: PipelineResult = {
    sourceId: source.id,
    sourceUsername: source.source_username,
    scanned: 0,
    created: 0,
    skipped: 0,
    reusedMaterial: 0,
    drafts: [],
    notes: []
  };

  // 子系統憑證一次解析（自綁優先，退回 env）：Apify（爬蟲）、Shopee（分潤）、Gemini（AI）
  const apify = await getApifyCredentials(ownerId);
  const shopeeCreds = await ownerShopeeCreds(ownerId);
  const geminiKey = await getGeminiKey(ownerId);
  const copyPrefs = await getCopyPrefs(ownerId); // 一次取出，整個迴圈重用，避免每篇重查
  const posts = await scrapeLatestPosts(source.source_username, source.posts_limit, apify);
  result.scanned = posts.length;

  for (const post of posts) {
    if (post.isReply) continue;

    // 單篇容錯：任一外部 API 失敗只略過該篇，不中斷整條流程
    try {
      if (await isPostProcessed(source.id, post.postId)) {
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
            media: { url: post.mediaUrl, type: post.mediaType },
            sourceText: post.text,
            subIdTag: source.source_username,
            withCopy: true
          },
          ownerId,
          shopeeCreds,
          result.notes,
          geminiKey,
          copyPrefs
        );
      }

      const draft = await createDraftFromMaterial(material, {
        owner_id: ownerId,
        source_id: source.id,
        threads_account_id: source.threads_account_id,
        source_post_id: post.postId,
        // 一律待人工核准——只有審核過的草稿才能發布（不自動發到 Threads）
        status: "draft"
      });

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
export async function runAllSources(): Promise<PipelineResult[]> {
  const ownerId = (await getOwnerUserId()) ?? "demo-user";
  const sources = (await listSources()).filter((s) => s.enabled);
  const results: PipelineResult[] = [];
  for (const s of sources) {
    results.push(await runSourcePipeline(s, ownerId));
  }
  return results;
}
