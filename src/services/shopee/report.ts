// Shopee 分潤「轉換報表」：抓實際成交佣金，做收益儀表板。
// 用 owner 的環境變數金鑰；沿用既有 HMAC 簽名與帶逾時的 fetch。
import { buildShopeeAuth } from "@/services/shopee/sign";
import { fetchWithTimeout } from "@/lib/http";
import { env } from "@/lib/env";
import { getCachedJson, setCachedJson } from "@/lib/store";

const GQL = "https://open-api.affiliate.shopee.tw/graphql";

interface ReportItem {
  itemName: string | null;
  itemId: number | null;
  imageUrl: string | null;
  itemTotalCommission: string | null;
}
interface ReportNode {
  purchaseTime: number;
  conversionStatus: string | null;
  totalCommission: string | null;
  netCommission: string | null;
  utmContent: string | null;
  orders: { items: ReportItem[] }[];
}

export interface AffiliateRevenue {
  days: number;
  totalConversions: number;
  totalCommission: number; // 估計總佣金（net）
  byStatus: { status: string; count: number; commission: number }[];
  byItem: { name: string; commission: number; count: number }[];
  byDay: { date: string; commission: number }[];
  bySubId: { subId: string; commission: number; count: number }[];
  truncated: boolean; // 是否因頁數上限而截斷
}

const num = (s: string | null | undefined) => {
  const n = parseFloat(s ?? "");
  return Number.isFinite(n) ? n : 0;
};

// 抓近 N 天轉換報表（分頁，最多抓 maxPages 頁避免吃滿時間）。
async function fetchConversions(days: number, maxPages = 10): Promise<{ nodes: ReportNode[]; truncated: boolean }> {
  const appId = env.shopeeAppId;
  const secret = env.shopeeSecret;
  if (!appId || !secret) throw new Error("未設定 Shopee 分潤金鑰");

  const end = Math.floor(Date.now() / 1000);
  const start = end - days * 86400;
  const nodes: ReportNode[] = [];
  let scrollId = "";
  let truncated = false;

  // 報表選擇集（兩種 query 變體共用）。start/end/limit 為數值（安全內插）；
  // scrollId 來自 Shopee 回傳，改用 GraphQL variables 傳遞、不字串拼接（避免破壞查詢/注入）。
  const selection =
    "nodes { purchaseTime conversionStatus totalCommission netCommission utmContent orders { items { itemId itemName imageUrl itemTotalCommission } } } pageInfo { hasNextPage scrollId }";
  for (let page = 0; page < maxPages; page++) {
    // 首頁不帶 scrollId（維持原行為，避免傳 null 被 API 拒）；後續頁以 variable 帶入。
    const query = scrollId
      ? `query($scrollId:String!){ conversionReport(purchaseTimeStart:${start}, purchaseTimeEnd:${end}, limit:100, scrollId:$scrollId) { ${selection} } }`
      : `{ conversionReport(purchaseTimeStart:${start}, purchaseTimeEnd:${end}, limit:100) { ${selection} } }`;
    const payload = JSON.stringify(scrollId ? { query, variables: { scrollId } } : { query });
    const auth = buildShopeeAuth(appId, secret, payload);
    const res = await fetchWithTimeout(
      GQL,
      { method: "POST", headers: { "Content-Type": "application/json", Authorization: auth.authorization }, body: payload },
      15000
    );
    if (!res.ok) throw new Error(`Shopee 報表 API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = await res.json();
    if (json.errors?.length) throw new Error(`Shopee 報表錯誤: ${JSON.stringify(json.errors).slice(0, 200)}`);
    const rep = json?.data?.conversionReport;
    nodes.push(...((rep?.nodes ?? []) as ReportNode[]));
    if (!rep?.pageInfo?.hasNextPage) break;
    scrollId = rep.pageInfo.scrollId ?? "";
    if (page === maxPages - 1 && rep.pageInfo.hasNextPage) truncated = true;
  }
  return { nodes, truncated };
}

export async function getAffiliateRevenue(days = 30): Promise<AffiliateRevenue> {
  const { nodes, truncated } = await fetchConversions(days);

  const statusMap = new Map<string, { count: number; commission: number }>();
  const itemMap = new Map<string, { commission: number; count: number }>();
  const dayMap = new Map<string, number>();
  const subMap = new Map<string, { commission: number; count: number }>();
  let totalCommission = 0;

  for (const n of nodes) {
    const comm = num(n.netCommission ?? n.totalCommission);
    totalCommission += comm;

    const st = n.conversionStatus ?? "UNKNOWN";
    const s = statusMap.get(st) ?? { count: 0, commission: 0 };
    s.count++;
    s.commission += comm;
    statusMap.set(st, s);

    const day = new Date(n.purchaseTime * 1000).toLocaleDateString("zh-TW", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    dayMap.set(day, (dayMap.get(day) ?? 0) + comm);

    const sub = n.utmContent && n.utmContent.trim() ? n.utmContent.trim() : "（未標記）";
    const sb = subMap.get(sub) ?? { commission: 0, count: 0 };
    sb.commission += comm;
    sb.count++;
    subMap.set(sub, sb);

    for (const o of n.orders ?? []) {
      for (const it of o.items ?? []) {
        const name = it.itemName ?? "（未知商品）";
        const im = itemMap.get(name) ?? { commission: 0, count: 0 };
        im.commission += num(it.itemTotalCommission);
        im.count++;
        itemMap.set(name, im);
      }
    }
  }

  const round = (x: number) => Math.round(x * 100) / 100;
  const topItems = [...itemMap.entries()]
    .map(([name, v]) => ({ name, commission: round(v.commission), count: v.count }))
    .sort((a, b) => b.commission - a.commission)
    .slice(0, 10);
  const topSubs = [...subMap.entries()]
    .map(([subId, v]) => ({ subId, commission: round(v.commission), count: v.count }))
    .sort((a, b) => b.commission - a.commission)
    .slice(0, 10);

  return {
    days,
    totalConversions: nodes.length,
    totalCommission: round(totalCommission),
    byStatus: [...statusMap.entries()].map(([status, v]) => ({ status, count: v.count, commission: round(v.commission) })),
    byItem: topItems,
    byDay: [...dayMap.entries()].map(([date, commission]) => ({ date, commission: round(commission) })).sort((a, b) => a.date.localeCompare(b.date)),
    bySubId: topSubs,
    truncated
  };
}

export interface ItemRevenue {
  commission: number;
  count: number;
}

// 依 itemId 彙整實際佣金（數值對應素材 item_id，比 itemName 模糊比對可靠）。純函式可測。
export function aggregateItemRevenue(
  nodes: { orders?: { items?: { itemId: number | null; itemTotalCommission: string | null }[] }[] }[]
): Record<string, ItemRevenue> {
  const map: Record<string, ItemRevenue> = {};
  for (const n of nodes) {
    for (const o of n.orders ?? []) {
      for (const it of o.items ?? []) {
        if (it.itemId == null) continue;
        const key = String(it.itemId);
        const cur = map[key] ?? { commission: 0, count: 0 };
        cur.commission = Math.round((cur.commission + num(it.itemTotalCommission)) * 100) / 100;
        cur.count++;
        map[key] = cur;
      }
    }
  }
  return map;
}

// 素材成效回灌用：itemId → 佣金/筆數 對照（owner 限定，app_state 快取省 API 額度）。
// 失敗/未設金鑰由呼叫端 catch 成空物件，不擋素材頁。
export async function getItemRevenueMap(ownerId: string, days = 30): Promise<Record<string, ItemRevenue>> {
  const key = `item_revenue:${ownerId}:${days}`;
  const cached = await getCachedJson<Record<string, ItemRevenue>>(key, 6 * 3600_000).catch(() => null);
  if (cached) return cached;
  const { nodes } = await fetchConversions(days);
  const map = aggregateItemRevenue(nodes);
  await setCachedJson(key, map).catch(() => {});
  return map;
}
