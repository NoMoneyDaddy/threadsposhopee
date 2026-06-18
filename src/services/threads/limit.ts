// 查 Threads 發文額度（每帳號每 24h 上限 250）。用於儀表板即時顯示用量。
const GRAPH = "https://graph.threads.net/v1.0";

export interface PublishingLimit {
  used: number;
  limit: number;
  replyUsed?: number;
}

export async function getPublishingLimit(userId: string, token: string): Promise<PublishingLimit | null> {
  try {
    const url = `${GRAPH}/${userId}/threads_publishing_limit?fields=quota_usage,config,reply_quota_usage,reply_config&access_token=${token}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const json = await res.json();
    const row = Array.isArray(json.data) ? json.data[0] : json.data ?? json;
    return {
      used: row?.quota_usage ?? 0,
      limit: row?.config?.quota_total ?? 250,
      replyUsed: row?.reply_quota_usage
    };
  } catch {
    return null;
  }
}
