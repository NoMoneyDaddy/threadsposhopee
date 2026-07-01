// AI 代理人領域（新聞分類式）：每個領域給「多個關鍵字」（各組一條 Google News RSS 查詢做聚合）與敏感旗標。
// 用 Google News RSS 搜尋＝免費、穩定、涵蓋全主題（時事/八卦/明星/科技…），免逐一維護來源。
// 多關鍵字聚合：單一窄查詢常常「找不到趨勢/新題材」，改為多條查詢聚合＋依時間排序，確保有當日新鮮內容。

export interface AiDomain {
  id: string;
  label: string;
  keywords: string[]; // 餵 Google News RSS 的多個查詢詞（各自一條 feed，聚合取材）
  sensitive?: boolean; // 敏感領域：產文 prompt 加保守規則
}

export const AI_DOMAINS: AiDomain[] = [
  { id: "news", label: "時事/新聞", keywords: ["今日新聞", "頭條", "熱門話題"], sensitive: true },
  { id: "gossip", label: "八卦", keywords: ["八卦", "爆料", "網路熱議"], sensitive: true },
  { id: "celebrity", label: "明星/娛樂", keywords: ["明星", "藝人", "娛樂新聞"], sensitive: true },
  { id: "entertainment", label: "影劇", keywords: ["影劇", "戲劇", "電影", "Netflix"] },
  { id: "music", label: "音樂", keywords: ["音樂", "歌手", "新歌", "演唱會"] },
  { id: "tech", label: "科技", keywords: ["科技", "3C", "手機", "蘋果"] },
  { id: "ai", label: "AI", keywords: ["人工智慧", "AI", "ChatGPT", "生成式 AI"] },
  { id: "finance", label: "財經/理財", keywords: ["財經", "理財", "投資"] },
  { id: "stock", label: "股市", keywords: ["股市", "台股", "美股"], sensitive: true },
  { id: "sports", label: "運動", keywords: ["運動", "體育", "賽事"] },
  { id: "food", label: "美食", keywords: ["美食", "餐廳", "小吃", "團購美食"] },
  { id: "travel", label: "旅遊", keywords: ["旅遊", "景點", "出國", "國旅"] },
  { id: "game", label: "遊戲", keywords: ["電玩", "遊戲", "Switch", "手遊"] },
  { id: "acg", label: "動漫ACG", keywords: ["動漫", "ACG", "二次元", "新番"] },
  { id: "beauty", label: "時尚/美妝", keywords: ["時尚", "美妝", "穿搭", "保養"] },
  { id: "life", label: "生活", keywords: ["生活", "居家", "省錢", "開箱"] },
  { id: "health", label: "健康", keywords: ["健康", "養生", "醫療"], sensitive: true },
  { id: "world", label: "國際", keywords: ["國際新聞", "全球", "外電"], sensitive: true },
  { id: "auto", label: "汽車3C", keywords: ["汽車", "車訊", "電動車", "新車"] },
  { id: "appliance", label: "家電", keywords: ["家電", "開箱", "評測", "好物"] },
  { id: "startup", label: "創業", keywords: ["創業", "新創", "商業模式"] },
  { id: "parenting", label: "母嬰", keywords: ["母嬰", "育兒", "親子"] },
  { id: "pet", label: "寵物", keywords: ["寵物", "毛小孩", "貓狗"] },
  { id: "horoscope", label: "星座命理", keywords: ["星座", "運勢", "命理"] },
  // 自訂：keywords 留空，改用 agent.search_query 組查詢
  { id: "custom", label: "自訂主題", keywords: [] }
];

export function getAiDomain(id: string): AiDomain | undefined {
  return AI_DOMAINS.find((d) => d.id === id);
}

// 組 Google News RSS 查詢網址（繁中、台灣）。免金鑰、穩定。
export function googleNewsRss(query: string): string {
  const q = encodeURIComponent(query.trim());
  return `https://news.google.com/rss/search?q=${q}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`;
}

// 領域預設來源（agent.rss_feeds 為空時用）：每個關鍵字各一條 Google News feed（聚合取材）。
export function defaultFeedsForDomain(domainId: string): string[] {
  const d = getAiDomain(domainId);
  return d ? d.keywords.map((k) => googleNewsRss(k)) : [];
}

// 解析小編實際橫跨的領域 id：優先用 domains 陣列，為空時退回單一 domain（向後相容）。
export function resolveDomainIds(input: { domains?: string[] | null; domain?: string | null }): string[] {
  const ids = (input.domains ?? []).filter((id): id is string => typeof id === "string" && Boolean(getAiDomain(id)));
  if (ids.length) return ids;
  return input.domain && getAiDomain(input.domain) ? [input.domain] : [];
}
