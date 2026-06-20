// 極簡結構化日誌：輸出單行 JSON（time/level/msg + context），方便 log 平台依
// ownerId/draftId/accountId 過濾聚合，多租戶災情才能快速定位受影響用戶。
// ponytail：一個模組、零依賴，不引重型 log 框架。
// 慣例：錯誤/警告日誌都應帶可追蹤 context（至少 ownerId 或 accountId/draftId）。

type LogContext = Record<string, unknown>;
type Level = "info" | "warn" | "error";

function safeStringify(o: unknown): string {
  try {
    return JSON.stringify(o);
  } catch {
    return String(o);
  }
}

function emit(level: Level, msg: string, ctx?: LogContext): void {
  const rec: Record<string, unknown> = { t: new Date().toISOString(), level, msg };
  if (ctx) {
    for (const [k, v] of Object.entries(ctx)) {
      // Error 物件取 message，避免 JSON.stringify 後變成空物件 {}
      rec[k] = v instanceof Error ? v.message : v;
    }
  }
  const line = safeStringify(rec);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (msg: string, ctx?: LogContext) => emit("info", msg, ctx),
  warn: (msg: string, ctx?: LogContext) => emit("warn", msg, ctx),
  error: (msg: string, ctx?: LogContext) => emit("error", msg, ctx)
};
