// AI 代理人領域（新聞分類式）：每個領域給關鍵字（組 Google News RSS 查詢）與敏感旗標。
// 用 Google News RSS 搜尋＝免費、穩定、涵蓋全主題（時事/八卦/明星/科技…），免逐一維護來源。

export interface AiDomain {
  id: string;
  label: string;
  keyword: string; // 餵 Google News RSS 的查詢詞
  sensitive?: boolean; // 敏感領域：產文 prompt 加保守規則
}

export const AI_DOMAINS: AiDomain[] = [
  { id: "news", label: "時事/新聞", keyword: "今日 新聞 頭條", sensitive: true },
  { id: "gossip", label: "八卦", keyword: "八卦 爆料", sensitive: true },
  { id: "celebrity", label: "明星/娛樂", keyword: "明星 藝人 娛樂", sensitive: true },
  { id: "entertainment", label: "影劇", keyword: "影劇 戲劇 電影" },
  { id: "music", label: "音樂", keyword: "音樂 歌手 新歌" },
  { id: "tech", label: "科技", keyword: "科技 3C" },
  { id: "ai", label: "AI", keyword: "人工智慧 AI" },
  { id: "finance", label: "財經/理財", keyword: "財經 理財" },
  { id: "stock", label: "股市", keyword: "股市 台股", sensitive: true },
  { id: "sports", label: "運動", keyword: "運動 體育" },
  { id: "food", label: "美食", keyword: "美食 餐廳 小吃" },
  { id: "travel", label: "旅遊", keyword: "旅遊 景點" },
  { id: "game", label: "遊戲", keyword: "電玩 遊戲" },
  { id: "acg", label: "動漫ACG", keyword: "動漫 ACG 二次元" },
  { id: "beauty", label: "時尚/美妝", keyword: "時尚 美妝 穿搭" },
  { id: "life", label: "生活", keyword: "生活 居家" },
  { id: "health", label: "健康", keyword: "健康 養生", sensitive: true },
  { id: "world", label: "國際", keyword: "國際 新聞", sensitive: true },
  { id: "auto", label: "汽車3C", keyword: "汽車 車訊" },
  { id: "appliance", label: "家電", keyword: "家電 開箱 評測" },
  { id: "startup", label: "創業", keyword: "創業 新創 商業模式" },
  { id: "parenting", label: "母嬰", keyword: "母嬰 育兒 親子" },
  { id: "pet", label: "寵物", keyword: "寵物 毛小孩" },
  { id: "horoscope", label: "星座命理", keyword: "星座 運勢" },
  // 自訂：keyword 留空，改用 agent.search_query 組查詢
  { id: "custom", label: "自訂主題", keyword: "" }
];

export function getAiDomain(id: string): AiDomain | undefined {
  return AI_DOMAINS.find((d) => d.id === id);
}

// 組 Google News RSS 查詢網址（繁中、台灣）。免金鑰、穩定。
export function googleNewsRss(query: string): string {
  const q = encodeURIComponent(query.trim());
  return `https://news.google.com/rss/search?q=${q}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`;
}

// 領域預設來源（agent.rss_feeds 為空時用）。
export function defaultFeedsForDomain(domainId: string): string[] {
  const d = getAiDomain(domainId);
  return d ? [googleNewsRss(d.keyword)] : [];
}
