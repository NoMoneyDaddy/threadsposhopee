import { NextResponse } from "next/server";
import { log } from "./logger";

// 取可讀錯誤訊息：Error 取 .message；Supabase/PostgrestError 等「帶 message 的物件」也取 .message，
// 不要 String(物件) 變成 "[object Object]"。供 owner-only 路徑把真實原因（如缺欄位）回給使用者排查。
export function errMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && typeof (e as { message?: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  return String(e);
}

// 對外錯誤收斂：原始錯誤（可能含上游/供應商回應、內部 ID、token 片段）只進 log，
// 回給 client 一律固定文案，避免資訊洩漏。需要特定狀態碼/提示時用 opts 覆寫。
export function apiError(
  where: string,
  e: unknown,
  opts?: { status?: number; clientMessage?: string }
): NextResponse {
  log.error(where, { err: e });
  return NextResponse.json(
    { ok: false, error: opts?.clientMessage ?? "操作失敗，請稍後再試" },
    { status: opts?.status ?? 500 }
  );
}
