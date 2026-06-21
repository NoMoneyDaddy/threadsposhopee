// 蝦皮分潤 subId 正規化（官方規範）：僅允許英數與底線，長度上限 50。
// 來源常含非法字元（@、中文、空白）需清洗；報表依 subId 分流統計。
export const SUBID_MAX = 50;

export function normalizeSubId(s: string | null | undefined): string {
  return (s ?? "").replace(/[^a-zA-Z0-9_]/g, "").slice(0, SUBID_MAX);
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
