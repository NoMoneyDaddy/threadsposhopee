// 端到端流程編排（含素材庫重用）：
// 爬1篇 → 去重 → 抓蝦皮連結 → 還原 → 查素材庫
//   命中且連結有效 → 重用文案/連結/媒體（0 AI token、0 Shopee API）
//   未命中 → 換分潤連結(帶追蹤 subId) + 商品名 + AI 文案 + Cloudinary → 建素材
// → 從素材產生草稿。auto_publish 來源直接 approved 進發文佇列。
import { scrapeLatestPosts } from "@/services/scraper/threads";
import { expandShopeeLink } from "@/services/shopee/expand";
import { generateAffiliateLink, getProductName, buildSubIds } from "@/services/shopee/affiliate";
import { generateCopy } from "@/services/ai/provider";
import { uploadToCloudinary } from "@/services/media/cloudinary";
import { env, isDemoMode } from "@/lib/env";
import {
  isPostProcessed,
  markPostProcessed,
  listSources,
  findMaterial,
  createMaterial,
  createDraftFromMaterial
} from "@/lib/store";
import type { Material, Source } from "@/lib/types";

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

// 為某商品建立（或重產）素材：換分潤連結、取商品名、AI 文案、媒體中轉
async function buildMaterial(
  source: Source,
  shopId: string,
  itemId: string,
  cleanUrl: string,
  originalShortLink: string,
  media: { url: string | null; type: "image" | "video" | "none" },
  sourceText: string,
  notes: string[]
): Promise<Material> {
  let shortLink = originalShortLink;
  let subId: string | null = null;
  let productName: string | null = null;

  if (!isDemoMode && env.shopeeAppId && env.shopeeSecret) {
    try {
      const subIds = buildSubIds(env.shopeeDefaultSubId, source.source_username, itemId);
      subId = subIds.join(",");
      shortLink = await generateAffiliateLink(env.shopeeAppId, env.shopeeSecret, cleanUrl, subIds);
      productName = await getProductName(env.shopeeAppId, env.shopeeSecret, shopId, itemId);
    } catch (e) {
      notes.push(`Shopee API 失敗（用原連結）：${e instanceof Error ? e.message : String(e)}`);
    }
  } else {
    productName = `商品 ${itemId}`;
    notes.push("Demo / 未設定 Shopee 金鑰：用原連結與假商品名");
  }

  // 媒體中轉（Threads CDN 連結會過期）
  let cloudinaryMediaUrl = media.url;
  if (!isDemoMode && media.url && media.type !== "none") {
    try {
      cloudinaryMediaUrl = await uploadToCloudinary(media.url, media.type);
    } catch (e) {
      notes.push(`Cloudinary 上傳失敗（暫用原連結）：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const copy = await generateCopy({
    productName: productName ?? "這個好物",
    shopeeShortLink: shortLink,
    sourceText,
    mediaUrl: media.url,
    mediaType: media.type
  });

  const now = new Date().toISOString();
  return createMaterial({
    shop_id: shopId,
    item_id: itemId,
    product_name: productName,
    clean_product_url: cleanUrl,
    affiliate_short_link: shortLink,
    affiliate_sub_id: subId,
    affiliate_generated_at: now,
    affiliate_valid: true,
    media_type: media.type,
    source_media_url: media.url,
    cloudinary_media_url: cloudinaryMediaUrl,
    main_text: copy.mainText,
    reply_text: copy.replyText,
    ai_raw: copy.raw,
    ai_generated_at: now
  });
}

export async function runSourcePipeline(source: Source): Promise<PipelineResult> {
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

  const posts = await scrapeLatestPosts(source.source_username, source.posts_limit);
  result.scanned = posts.length;

  for (const post of posts) {
    if (post.isReply) continue;

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
    let material = await findMaterial(expanded.shopId, expanded.itemId);
    if (material && material.affiliate_valid && material.main_text && material.affiliate_short_link) {
      result.reusedMaterial++;
      result.notes.push(`商品 ${expanded.itemId} 重用既有素材（未燒 token）`);
    } else {
      material = await buildMaterial(
        source,
        expanded.shopId,
        expanded.itemId,
        expanded.cleanUrl,
        post.shopeeLinks[0],
        { url: post.mediaUrl, type: post.mediaType },
        post.text,
        result.notes
      );
    }

    const draft = await createDraftFromMaterial(material, {
      source_id: source.id,
      threads_account_id: source.threads_account_id,
      source_post_id: post.postId,
      // 來源設「全自動」→ 直接 approved 進發文佇列；否則待人工核准
      status: source.auto_publish ? "approved" : "draft"
    });

    await markPostProcessed(source.id, post.postId);
    result.created++;
    result.drafts.push({ id: draft.id, productName: material.product_name ?? null });
  }

  return result;
}

// 跑所有啟用中的來源（給排程 / 手動觸發用）
export async function runAllSources(): Promise<PipelineResult[]> {
  const sources = (await listSources()).filter((s) => s.enabled);
  const results: PipelineResult[] = [];
  for (const s of sources) {
    results.push(await runSourcePipeline(s));
  }
  return results;
}
