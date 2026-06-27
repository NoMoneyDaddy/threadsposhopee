// 蝦皮分潤 subId 正規化（官方規範）：僅允許英數與底線，長度上限 50。
// 注意：蝦皮 sub_id 在連結中以「-」分隔 5 格，故值本身不可含「-」（會破壞分隔），這裡也一併排除。
// 來源常含非法字元（@、中文、空白）需清洗；報表依 subId 分流統計。
export const SUBID_MAX = 50;

export function normalizeSubId(s: string | null | undefined): string {
  return (s ?? "").replace(/[^a-zA-Z0-9_]/g, "").slice(0, SUBID_MAX);
}

// subId 範本的日期/時間變數值（台北時區）。date=YYYYMMDD、time=HHmm。
// 抽成純函式（注入 now）以便（1）多處共用同一格式（2）可測。
export function subIdDateTimeParts(now: Date): { date: string; time: string } {
  return {
    date: now.toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" }).replace(/-/g, ""),
    time: now.toLocaleTimeString("en-GB", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hour12: false }).replace(":", "")
  };
}

// subId 範本：把 5 個變數換成實值後再正規化，供使用者自由排列組合。
// date＝發文日期 YYYYMMDD（台北）；time＝發文時間 HHmm（台北）；platform＝發文平台；
// account＝帳號短碼/暱稱；item＝商品 itemId。
export function resolveSubIdTemplate(
  template: string | null | undefined,
  ctx: { date: string; time?: string; platform: string; account: string; item?: string }
): string {
  const replaced = (template ?? "")
    .replace(/\{date\}/gi, ctx.date)
    .replace(/\{time\}/gi, ctx.time ?? "")
    .replace(/\{platform\}/gi, ctx.platform)
    .replace(/\{account\}/gi, ctx.account)
    .replace(/\{item\}/gi, ctx.item ?? "");
  return normalizeSubId(replaced);
}

const SUBID_TOKENS = /\{(date|time|platform|account|item)\}/gi;

// 驗證「自訂 subId 範本」：移除合法變數後，剩餘只能含英數與底線，且整體長度 ≤ 50。
export function isValidSubIdTemplate(s: string): boolean {
  if (s.length > SUBID_MAX) return false;
  return /^[a-zA-Z0-9_]*$/.test(s.replace(SUBID_TOKENS, ""));
}

// 自訂來源標記以「逗號分隔」存放，對應蝦皮 sub_id1..5 共 5 格。解析成陣列（去空、最多 5）。
export function parseSubIdSlots(stored: string | null | undefined): string[] {
  return (stored ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 5);
}

// 一組 subId：正規化、去空、去重、最多 5 個（蝦皮 sub_id1..5）。
export function normalizeSubIds(list: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const item of list) {
    const v = normalizeSubId(item);
    if (v && !out.includes(v)) out.push(v);
    if (out.length >= 5) break;
  }
  return out;
}
