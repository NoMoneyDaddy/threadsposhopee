import { NextResponse } from "next/server";
import { log } from "./logger";

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
