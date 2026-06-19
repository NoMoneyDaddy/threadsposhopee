import { env, isDemoMode } from "@/lib/env";
import sampleThread from "@/fixtures/sample-thread.json";
import { fetchWithTimeout } from "@/lib/http";

export interface ScrapedPost {
  postId: string;
  isReply: boolean;
  text: string;
  mediaType: "image" | "video" | "none";
  mediaUrl: string | null;
  shopeeLinks: string[];
}

// 抓取蝦皮連結：短連結（s.shopee.tw / shope.ee）或完整商品網址（shopee.tw/...）
const SHOPEE_SHORT_RE =
  /(https?:\/\/(?:s\.shopee\.tw|shope\.ee)\/[a-zA-Z0-9]+|https?:\/\/shopee\.tw\/[^\s"'()]+)/g;

// 把 Apify/Threads 巢狀 JSON 攤平成 ScrapedPost[]（對應 n8n「結構化資料」節點）
export function parseThreadPayload(payload: any): ScrapedPost[] {
  const items: any[] = payload?.node?.thread_items ?? [];
  const out: ScrapedPost[] = [];
  for (const item of items) {
    const post = item.post ?? item;
    if (!post) continue;

    const text: string = post.caption?.text ?? "";
    let mediaType: ScrapedPost["mediaType"] = "none";
    let mediaUrl: string | null = null;

    if (post.media_type === 2 && post.video_versions?.length) {
      mediaType = "video";
      mediaUrl = post.video_versions[0].url;
    } else if (post.media_type === 8 && post.carousel_media?.length) {
      const first = post.carousel_media[0];
      if (first.video_versions?.length) {
        mediaType = "video";
        mediaUrl = first.video_versions[0].url;
      } else if (first.image_versions2?.candidates?.length) {
        mediaType = "image";
        mediaUrl = first.image_versions2.candidates[0].url;
      }
    } else if (post.image_versions2?.candidates?.length) {
      mediaType = "image";
      mediaUrl = post.image_versions2.candidates[0].url;
    }

    out.push({
      postId: String(post.pk ?? post.id ?? post.code),
      isReply: Boolean(post.is_reply),
      text,
      mediaType,
      mediaUrl,
      shopeeLinks: Array.from(text.matchAll(SHOPEE_SHORT_RE)).map((m) => m[1])
    });
  }
  return out;
}

// 呼叫 Apify Threads Scraper 取得來源帳號最新貼文。Demo 模式直接回 fixture。
// creds：使用者自己綁的 Apify token/actor；沒傳則退回全域 env（向後相容）。
export async function scrapeLatestPosts(
  username: string,
  postsLimit = 1,
  creds?: { token: string; actor?: string | null } | null
): Promise<ScrapedPost[]> {
  const token = creds?.token || env.apifyToken;
  const actor = creds?.actor || env.apifyActor;
  // Demo 模式才回假資料；正式環境沒金鑰要報錯，避免靜默吞掉（誤以為有在爬）
  if (isDemoMode) {
    return parseThreadPayload(sampleThread);
  }
  if (!token) {
    throw new Error("未綁定 Apify token（到帳號管理綁定，或設 APIFY_TOKEN）");
  }

  const url = `https://api.apify.com/v2/acts/${actor.replace("/", "~")}/run-sync-get-dataset-items?token=${token}`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      usernames: [username],
      users_enabled: true,
      fetch_posts: true,
      posts_limit: postsLimit,
      search_enabled: false,
      fetch_detail_with_biolink: false
    })
  }, 45000); // run-sync 會等爬蟲跑完，放寬到 45s
  if (!res.ok) throw new Error(`Apify 失敗: ${res.status} ${await res.text()}`);
  const dataset = await res.json();
  // Apify 回傳是 dataset items 陣列；逐筆解析後攤平
  return (Array.isArray(dataset) ? dataset : [dataset]).flatMap(parseThreadPayload);
}
