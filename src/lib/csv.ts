// CSV 工具：欄位逸出與列組裝。逸出邏輯關乎注入安全（含逗號/引號/換行需正確包裹），故獨立可測。

// 欄位逸出：含逗號/引號/換行（含 \r）則用雙引號包起並把內部引號加倍（RFC 4180）。
// 收 unknown：內部已做 null 處理與 String() 安全轉換，免去呼叫端寬鬆斷言。
export function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// 依欄位鍵把物件陣列組成 CSV 內文（不含表頭）；缺值以空字串補。
export function csvRows<T extends object>(list: readonly T[], cols: string[]): string {
  return list
    .map((r) => cols.map((c) => csvCell((r as Record<string, unknown>)[c])).join(","))
    .join("\n");
}
