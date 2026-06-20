// 彙整最近貼文的 Threads 互動數據：逐帳號 token 查每篇 insights，加總並依觀看數排序。
import { listRecentPublishedPosts, listThreadsAccountTokens } from "@/lib/store";
import { getPostInsights, type PostInsights } from "./insights";

export interface PostEngagement extends PostInsights {
  id: string;
  productName: string | null;
  publishedAt: string | null;
}

export interface EngagementSummary {
  posts: PostEngagement[]; // 成功抓到數據者，依 views 由高到低
  totals: PostInsights;
  sampled: number; // 取樣的已發布貼文數
  fetched: number; // 實際抓到數據的數量
}

export async function getEngagement(ownerId: string, limit = 15): Promise<EngagementSummary> {
  const [posts, tokens] = await Promise.all([
    listRecentPublishedPosts(ownerId, limit),
    listThreadsAccountTokens(ownerId)
  ]);
  const tokenMap = new Map(tokens.map((t) => [t.id, t.accessToken]));

  const results = await Promise.all(
    posts.map(async (p): Promise<PostEngagement | null> => {
      const token = p.threads_account_id ? tokenMap.get(p.threads_account_id) : undefined;
      if (!token) return null;
      const ins = await getPostInsights(p.published_post_id, token);
      if (!ins) return null;
      return { id: p.id, productName: p.product_name, publishedAt: p.published_at, ...ins };
    })
  );
  const got = results.filter((x): x is PostEngagement => x !== null);

  const totals = got.reduce<PostInsights>(
    (a, p) => ({
      views: a.views + p.views,
      likes: a.likes + p.likes,
      replies: a.replies + p.replies,
      reposts: a.reposts + p.reposts,
      quotes: a.quotes + p.quotes,
      shares: a.shares + p.shares
    }),
    { views: 0, likes: 0, replies: 0, reposts: 0, quotes: 0, shares: 0 }
  );
  got.sort((a, b) => b.views - a.views);

  return { posts: got, totals, sampled: posts.length, fetched: got.length };
}
