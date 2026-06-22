// Shopee 分潤「轉換報表」：抓實際成交佣金，做收益儀表板。
// 用 owner 的環境變數金鑰；沿用既有 HMAC 簽名與帶逾時的 fetch。
import { callShopeeGql } from "@/services/shopee/gql";
import { normalizeSubId } from "@/services/shopee/subid";
import { env } from "@/lib/env";
import { getCachedJson, setCachedJson } from "@/lib/store";

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
  byAccount?: { name: string; commission: number; count: number }[]; // 依 sp_<帳號碼> 歸因到發文帳號（owner 帶 accounts 時才算）
  truncated: boolean; // 是否因頁數上限而截斷
}

// 純函式：把 subId→收益 對照，依贊助連結的 sp_<帳號前8碼> 標記歸因到各發文帳號；無對應者歸「其他」。
// utmContent 可能含多個 subId 串接，故以「包含」判定。可測。
export function attributeRevenueByAccount(
  subs: { subId: string; commission: number; count: number }[],
  accounts: { id: string; label: string | null }[]
): { name: string; commission: number; count: number }[] {
  // token 與 subId 一律轉小寫比對：utm 可能因平台/手動輸入大小寫不一致，避免漏歸因。
  const tokens = accounts
    .map((a) => ({ token: normalizeSubId(`sp_${a.id.slice(0, 8)}`).toLowerCase(), name: a.label || a.id.slice(0, 8) }))
    .filter((t) => t.token.length > 0);
  const map = new Map<string, { commission: number; count: number }>();
  for (const s of subs) {
    const lower = s.subId.toLowerCase();
    const hit = tokens.find((t) => lower.includes(t.token));
    const key = hit ? hit.name : "其他／未對應";
    const cur = map.get(key) ?? { commission: 0, count: 0 };
    cur.commission += s.commission;
    cur.count += s.count;
    map.set(key, cur);
  }
  return [...map.entries()]
    .map(([name, v]) => ({ name, commission: Math.round(v.commission * 100) / 100, count: v.count }))
    .sort((a, b) => b.commission - a.commission);
}

// 解析金額字串為數值：先去千分位逗號（"1,234.50" → 1234.5），無法解析回 0。
// 純函式可測。蝦皮金額常破千，未去逗號會被 parseFloat 在逗號處截斷而嚴重低估。
export function parseMoney(s: string | null | undefined): number {
  const n = parseFloat((s ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}
const num = parseMoney;

// 蝦皮 conversionReport 僅能查「近 3 個月」，起點早於此會回 error 11001 而整個讀取失敗。
// 用 88 天為上限（保守涵蓋最短的 3 個曆月，避免邊界被拒）；起點早於上限則夾到上限。純函式可測。
export const SHOPEE_MAX_LOOKBACK_SEC = 88 * 86400;
export function clampShopeeStart(startSec: number, nowSec: number): number {
  const earliest = nowSec - SHOPEE_MAX_LOOKBACK_SEC;
  return startSec < earliest ? earliest : startSec;
}

// 抓指定時間窗（秒）轉換報表（分頁，最多抓 maxPages 頁避免吃滿時間）。
async function fetchConversions(start: number, end: number, maxPages = 10): Promise<{ nodes: ReportNode[]; truncated: boolean }> {
  const appId = env.shopeeAppId;
  const secret = env.shopeeSecret;
  if (!appId || !secret) throw new Error("未設定 Shopee 分潤金鑰");
  // 守住蝦皮 3 個月限制（任何呼叫端都受保護）。
  start = clampShopeeStart(start, Math.floor(Date.now() / 1000));

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
    // 共用呼叫：含 HMAC 簽名（對 payload）＋ SSRF 守衛＋錯誤分類。報表較慢，逾時放寬 15s。
    const data = await callShopeeGql(appId, secret, payload, 15000);
    const rep = data?.conversionReport;
    nodes.push(...((rep?.nodes ?? []) as ReportNode[]));
    if (!rep?.pageInfo?.hasNextPage) break;
    const nextScroll = rep.pageInfo.scrollId ?? "";
    // hasNextPage 但拿不到 scrollId：若續圈會走「首頁分支」重抓第一頁→佣金重複加總。
    // 視為截斷並停止，避免重複計入。
    if (!nextScroll) {
      truncated = true;
      break;
    }
    scrollId = nextScroll;
    if (page === maxPages - 1) truncated = true;
  }
  return { nodes, truncated };
}

// 接受「近 N 天」（數字）或明確時間窗 { startMs, endMs }（自訂區間）。
export async function getAffiliateRevenue(
  arg: number | { startMs: number; endMs: number } = 30,
  accounts?: { id: string; label: string | null }[]
): Promise<AffiliateRevenue> {
  const end = typeof arg === "number" ? Math.floor(Date.now() / 1000) : Math.floor(arg.endMs / 1000);
  const rawStart = typeof arg === "number" ? end - arg * 86400 : Math.floor(arg.startMs / 1000);
  // 夾到蝦皮 3 個月上限，讓 days 標示與實際抓取一致（避免「近 365 天」卻只有近 3 個月資料）。
  const start = clampShopeeStart(rawStart, Math.floor(Date.now() / 1000));
  const days = Math.max(1, Math.round((end - start) / 86400));
  const { nodes, truncated } = await fetchConversions(start, end);

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
  const allSubs = [...subMap.entries()].map(([subId, v]) => ({ subId, commission: round(v.commission), count: v.count }));
  const topSubs = [...allSubs].sort((a, b) => b.commission - a.commission).slice(0, 10);

  return {
    days,
    totalConversions: nodes.length,
    totalCommission: round(totalCommission),
    byStatus: [...statusMap.entries()].map(([status, v]) => ({ status, count: v.count, commission: round(v.commission) })),
    byItem: topItems,
    byDay: [...dayMap.entries()].map(([date, commission]) => ({ date, commission: round(commission) })).sort((a, b) => a.date.localeCompare(b.date)),
    bySubId: topSubs,
    byAccount: accounts?.length ? attributeRevenueByAccount(allSubs, accounts) : undefined,
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
  const end = Math.floor(Date.now() / 1000);
  const { nodes } = await fetchConversions(end - days * 86400, end);
  const map = aggregateItemRevenue(nodes);
  await setCachedJson(key, map).catch(() => {});
  return map;
}
