// 從任意 thrown 值取出可讀訊息（純函式，可測）。
// 重點：Supabase/PostgREST 等丟出的是「帶 message 的純物件」而非 Error 實例，
// 直接 String(obj) 會變成無用的 "[object Object]"，把真正錯誤蓋掉。此函式優先取 message。
export function errorMessage(e: unknown, fallback = "未知錯誤"): string {
  if (e instanceof Error) return e.message || fallback;
  if (typeof e === "string") return e.trim() || fallback;
  if (e && typeof e === "object") {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
    try {
      const j = JSON.stringify(e);
      if (j && j !== "{}" && j !== "[]") return j; // 退而求其次：序列化（仍比 [object Object] 有用）
    } catch {
      /* 含循環參照等無法序列化 → 用 fallback */
    }
  }
  return fallback;
}
