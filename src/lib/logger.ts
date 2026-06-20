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

// 縱深防禦：即使呼叫端誤把憑證放進 context，也不讓機密明文入 log。
const SECRET_KEY = /token|secret|password|authorization|api[_-]?key|access_token|refresh_token/i;

// 遞迴遮蔽巢狀物件/陣列中命中 SECRET_KEY 的欄位（如 headers.authorization）。
// 限深度避免循環參照/巨大物件造成 runaway（與既有 safeStringify 容錯一致）。
function redactDeep(input: unknown, depth = 0): unknown {
  if (depth > 6 || input === null || typeof input !== "object") return input;
  if (Array.isArray(input)) return input.map((v) => redactDeep(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    out[k] = SECRET_KEY.test(k) ? "[redacted]" : redactDeep(v, depth + 1);
  }
  return out;
}

function emit(level: Level, msg: string, ctx?: LogContext): void {
  const rec: Record<string, unknown> = { t: new Date().toISOString(), level, msg };
  if (ctx) {
    for (const [k, v] of Object.entries(ctx)) {
      if (SECRET_KEY.test(k)) rec[k] = "[redacted]";
      // Error 物件取 message，避免 JSON.stringify 後變成空物件 {}；其餘遞迴遮蔽巢狀機密。
      else rec[k] = v instanceof Error ? v.message : redactDeep(v);
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
