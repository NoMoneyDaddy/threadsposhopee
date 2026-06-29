// 帶逾時的 fetch：外部 API 掛住或變慢時，不讓單一請求拖垮整個 cron（預設 8 秒）。
// 用 AbortSignal.timeout 自動中止；逾時會丟 TimeoutError，由各 service 的 try/catch 處理。
export async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit = {},
  timeoutMs = 8000
): Promise<Response> {
  const signal = init.signal ?? AbortSignal.timeout(timeoutMs);
  return fetch(input, { ...init, signal });
}

// Retry-After 可能是「秒數」或「HTTP-date」；都支援，回傳等待毫秒（無法解析回 null）。
export function retryAfterMs(header: string | null, now = Date.now()): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (trimmed === "") return null; // 純空白：視為無效，讓呼叫端退回指數退避（避免 Number("")===0）
  const secs = Number(trimmed);
  if (Number.isFinite(secs)) return secs > 0 ? secs * 1000 : 0;
  const date = Date.parse(trimmed);
  if (!Number.isNaN(date)) return Math.max(0, date - now);
  return null;
}

// 帶逾時 + 退避重試的 fetch：預設只對 429（rate limited、請求「未被處理」）重試，遵守
// Retry-After（封頂 16s）；其餘狀態與網路錯誤直接回/拋，由呼叫端處理。
// 預設只重試 429 是刻意取捨——5xx 可能其實已處理（如 Apify 已觸發 run），重試恐重複副作用。
// retryStatuses 可覆寫要重試的狀態碼：對「無副作用」的呼叫（如 Gemini 純文字生成）可加入 500/503
// 這類暫時性錯誤（高流量／內部錯誤），重試安全且能大幅降低偶發失敗。
export async function fetchWithRetry(
  input: string | URL,
  init: RequestInit = {},
  timeoutMs = 8000,
  attempts = 3,
  retryStatuses: number[] = [429]
): Promise<Response> {
  let res = await fetchWithTimeout(input, init, timeoutMs);
  for (let i = 1; i < attempts && retryStatuses.includes(res.status); i++) {
    const waitMs = retryAfterMs(res.headers.get("retry-after")) ?? 1000 * 2 ** (i - 1);
    await new Promise((r) => setTimeout(r, Math.min(waitMs, 16_000)));
    res = await fetchWithTimeout(input, init, timeoutMs);
  }
  return res;
}
