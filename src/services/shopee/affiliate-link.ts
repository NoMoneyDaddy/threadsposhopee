// 把「轉址搭配的蝦皮連結」轉成分潤連結：若已是分潤連結則原樣回傳（不重複轉）。
// 用於 AI 代理人預設分潤連結等場景，讓使用者貼一般商品/商城連結也能自動帶分潤。
import { getShopeeCredentials, getShopeeAffiliateId, getShopeeSubId } from "@/lib/store";
import { generateAffiliateLink, buildAffiliateRedirectLink } from "./affiliate";
import { parseSubIdSlots, resolveSubIdTemplate, normalizeSubIds } from "./subid";
import { log } from "@/lib/logger";

// 判斷某連結是否「已是分潤連結」（純函式，可測）：
// - 含 affiliate_id 參數或 an_redir 路徑（自組 an_redir 分潤連結）
// - 或網域為蝦皮分潤/分享短連結（s.shopee.tw／shope.ee）——這類視為已是最終分潤/分享連結，不再轉換
// - 或展開後的商品連結已帶蝦皮分潤追蹤標記（mmp_pid=an_xxx／utm_source=an_xxx／utm_medium=affiliates）：
//   這類多半是「貼上自己（或他人）既有的分潤連結」，不應再被重轉（避免重複包裝、破壞既有歸屬）。
export function isAffiliateLink(raw: string): boolean {
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    if (u.searchParams.has("affiliate_id") || /an_redir/i.test(u.pathname)) return true;
    if (host === "s.shopee.tw" || host === "shope.ee") return true;
    const sp = u.searchParams;
    if (/^an_/i.test(sp.get("mmp_pid") ?? "") || /^an_/i.test(sp.get("utm_source") ?? "") || sp.get("utm_medium") === "affiliates") {
      return true;
    }
    return false;
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
export async function resolveAffiliateUrl(ownerId: string, url: string): Promise<ResolvedAffiliate> {
  const clean = url.trim();
  if (!clean) return { url: clean, converted: false };
  if (isAffiliateLink(clean)) return { url: clean, converted: false };

  // 多格自訂 subId（逗號分隔）逐格代換後＋來源標記 "agent"，正規化取前 5。
  const stored = await getShopeeSubId(ownerId).catch(() => null);
  const ctx = { date: "", time: "", platform: "threads", account: "agent", item: "" };
  const resolvedSlots = parseSubIdSlots(stored).map((s) => resolveSubIdTemplate(s, ctx));
  const subIds = normalizeSubIds([...resolvedSlots, "agent"]);
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
