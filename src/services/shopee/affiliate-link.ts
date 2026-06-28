// 把「轉址搭配的蝦皮連結」轉成分潤連結：若已是分潤連結則原樣回傳（不重複轉）。
// 用於 AI 代理人預設分潤連結等場景，讓使用者貼一般商品/商城連結也能自動帶分潤。
import { getShopeeCredentials, getShopeeAffiliateId, getShopeeSubId } from "@/lib/store";
import { generateAffiliateLink, buildAffiliateRedirectLink } from "./affiliate";
import { parseSubIdSlots, resolveSubIdTemplate, normalizeSubIds, normalizeSubId, subIdDateTimeParts } from "./subid";
import { log } from "@/lib/logger";

// 判斷某連結是否「已是分潤連結」（純函式，可測）：
// - 含 affiliate_id 參數或 an_redir 路徑（自組 an_redir 分潤連結）
// - 或網域為蝦皮分潤/分享短連結（s.shopee.tw／shope.ee）——這類視為已是最終分潤/分享連結，不再轉換
// - 或展開後的商品連結已帶蝦皮分潤追蹤標記（mmp_pid=an_xxx／utm_source=an_xxx／utm_medium=affiliates）：
//   這類多半是「貼上自己（或他人）既有的分潤連結」，不應再被重轉（避免重複包裝、破壞既有歸屬）。
// 蝦皮分潤/分享短網域（s.shopee.tw／shope.ee／shp.ee）：視為已是最終分潤/分享連結，不再轉換。
const SHOPEE_SHORT_HOSTS = new Set(["s.shopee.tw", "shope.ee", "shp.ee"]);
export function isAffiliateLink(raw: string): boolean {
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    if (u.searchParams.has("affiliate_id") || /an_redir/i.test(u.pathname)) return true;
    if (SHOPEE_SHORT_HOSTS.has(host)) return true;
    const sp = u.searchParams;
    if (/^an_/i.test(sp.get("mmp_pid") ?? "") || /^an_/i.test(sp.get("utm_source") ?? "") || sp.get("utm_medium") === "affiliates") {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// 判斷某連結是否「使用者本人的分潤連結」（純函式，可測）：URL 帶 affiliate_id 參數且等於本人的
// affiliate_id（an_redir 自組連結、或帶 ?affiliate_id= 的商品連結皆適用）。用於「存分潤連結時，
// 若已是本人連結就不另外重產／替換」。Open API 短連結（s.shopee.tw/xxx、shope.ee/xxx）為不透明
// 短碼，URL 上看不出 affiliate_id，無法驗證歸屬→回 false（交由既有重用／重產流程，絕不誤判他人為本人）。
export function isOwnAffiliateLink(raw: string, ownerAffiliateId: string | null | undefined): boolean {
  const own = ownerAffiliateId?.toString().trim();
  if (!own) return false;
  try {
    const aid = new URL(raw).searchParams.get("affiliate_id")?.trim();
    return Boolean(aid) && aid === own;
  } catch {
    return false;
  }
}

export interface ResolvedAffiliate {
  url: string;
  converted: boolean;
  note?: string;
}

// 把連結轉成該使用者的分潤連結：已是分潤連結→原樣；否則用 Open API（優先）或 affiliate_id 自組 an_redir；
// 都沒綁→原樣回傳並附說明（不擋）。
// opts：可覆寫 subId 範本情境（發文當下重算 date/time 時用）與來源標記；預設 date/time＝「現在」（台北）、
// 來源標記＝ "agent"。修正先前 date/time 傳空字串導致 {date}/{time} 變空白的問題。
export async function resolveAffiliateUrl(
  ownerId: string,
  url: string,
  opts: { now?: Date; account?: string; item?: string; sourceTag?: string } = {}
): Promise<ResolvedAffiliate> {
  const clean = url.trim();
  if (!clean) return { url: clean, converted: false };
  if (isAffiliateLink(clean)) return { url: clean, converted: false };

  // 多格自訂 subId（逗號分隔）逐格代換後＋來源標記，正規化取前 5。
  const stored = await getShopeeSubId(ownerId).catch(() => null);
  const { date, time } = subIdDateTimeParts(opts.now ?? new Date());
  const sourceTag = normalizeSubId(opts.sourceTag) || "agent";
  const ctx = { date, time, platform: "threads", account: normalizeSubId(opts.account) || sourceTag, item: opts.item ?? "" };
  const resolvedSlots = parseSubIdSlots(stored).map((s) => resolveSubIdTemplate(s, ctx));
  const subIds = normalizeSubIds([...resolvedSlots, sourceTag]);
  const creds = await getShopeeCredentials(ownerId).catch(() => null);
  if (creds) {
    try {
      const short = await generateAffiliateLink(creds.appId, creds.secret, clean, subIds);
      if (short) return { url: short, converted: true };
    } catch (e) {
      log.warn("預設連結轉分潤（Open API）失敗，改用 affiliate_id", { ownerId, err: e instanceof Error ? e.message : e });
    }
  }
  const affId = await getShopeeAffiliateId(ownerId).catch(() => null);
  if (affId) return { url: buildAffiliateRedirectLink(clean, affId, subIds), converted: true };

  return { url: clean, converted: false, note: "尚未綁定蝦皮分潤金鑰或 affiliate_id，已存原連結（不轉分潤）" };
}
