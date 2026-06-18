// 端到端流程編排：爬1篇 → 去重 → 抓蝦皮連結 → 還原 → 換分潤連結 → 取商品名 → AI 文案 → 存草稿。
// 之後若 source.auto_publish=true，再由 publishApprovedDrafts 接手發布。
import { scrapeLatestPosts } from "@/services/scraper/threads";
import { expandShopeeLink } from "@/services/shopee/expand";
import { generateAffiliateLink, getProductName } from "@/services/shopee/affiliate";
import { generateCopy } from "@/services/ai/provider";
import { uploadToCloudinary } from "@/services/media/cloudinary";
import { env, isDemoMode } from "@/lib/env";
import { createDraft, isPostProcessed, markPostProcessed, listSources } from "@/lib/store";
import type { Source } from "@/lib/types";

export interface PipelineResult {
  sourceId: string;
  sourceUsername: string;
  scanned: number;
  created: number;
  skipped: number;
  drafts: { id: string; productName: string | null }[];
  notes: string[];
}

// 跑單一來源
export async function runSourcePipeline(source: Source): Promise<PipelineResult> {
  const result: PipelineResult = {
    sourceId: source.id,
    sourceUsername: source.source_username,
    scanned: 0,
    created: 0,
    skipped: 0,
    drafts: [],
    notes: []
  };

  const posts = await scrapeLatestPosts(source.source_username, source.posts_limit);
  result.scanned = posts.length;

  for (const post of posts) {
    if (post.isReply) continue; // 只處理主貼文

    if (await isPostProcessed(source.id, post.postId)) {
      result.skipped++;
      continue;
    }

    if (post.shopeeLinks.length === 0) {
      result.notes.push(`貼文 ${post.postId} 沒有蝦皮連結，略過`);
      await markPostProcessed(source.id, post.postId);
      continue;
    }

    // 1) 還原短網址
    const expanded = await expandShopeeLink(post.shopeeLinks[0]);
    if (!expanded) {
      result.notes.push(`貼文 ${post.postId} 連結無法解析商品 id`);
      continue;
    }

    // 2) 換成自己 subId 的分潤短連結 + 取商品名（Demo / 缺金鑰時降級）
    const subId = env.shopeeDefaultSubId;
    let shortLink = post.shopeeLinks[0];
    let productName: string | null = null;

    if (!isDemoMode && env.shopeeAppId && env.shopeeSecret) {
      try {
        shortLink = await generateAffiliateLink(env.shopeeAppId, env.shopeeSecret, expanded.cleanUrl, [subId]);
        productName = await getProductName(env.shopeeAppId, env.shopeeSecret, expanded.shopId, expanded.itemId);
      } catch (e: any) {
        result.notes.push(`Shopee API 失敗（用原連結）：${e.message}`);
      }
    } else {
      productName = `商品 ${expanded.itemId}`;
      result.notes.push("Demo / 未設定 Shopee 金鑰：用原連結與假商品名");
    }

    // 3) AI 文案
    const copy = await generateCopy({
      productName: productName ?? "這個好物",
      shopeeShortLink: shortLink,
      sourceText: post.text,
      mediaUrl: post.mediaUrl,
      mediaType: post.mediaType
    });

    // 4) 媒體立即中轉到 Cloudinary（Threads CDN 連結約 24h 失效，審核拖延會發布失敗）
    let cloudinaryMediaUrl = post.mediaUrl;
    if (!isDemoMode && post.mediaUrl && post.mediaType !== "none") {
      try {
        cloudinaryMediaUrl = await uploadToCloudinary(post.mediaUrl, post.mediaType);
      } catch (e: any) {
        result.notes.push(`Cloudinary 上傳失敗（暫用原連結）：${e.message}`);
      }
    }

    // 5) 存草稿（進審核佇列；auto_publish 由排程另行處理）
    const draft = await createDraft({
      source_id: source.id,
      threads_account_id: source.threads_account_id,
      source_post_id: post.postId,
      product_name: productName,
      clean_product_url: expanded.cleanUrl,
      shopee_short_link: shortLink,
      media_type: post.mediaType,
      source_media_url: post.mediaUrl,
      cloudinary_media_url: cloudinaryMediaUrl,
      main_text: copy.mainText,
      reply_text: copy.replyText,
      ai_raw: copy.raw,
      status: "draft"
    });

    await markPostProcessed(source.id, post.postId);
    result.created++;
    result.drafts.push({ id: draft.id, productName });
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
