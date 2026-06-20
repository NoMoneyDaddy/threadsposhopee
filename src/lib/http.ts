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

// 帶逾時 + 429 退避重試的 fetch：只對 429（rate limited、請求「未被處理」）重試，遵守
// Retry-After（封頂 16s）；其餘狀態與網路錯誤直接回/拋，由呼叫端處理。
// 只重試 429 是刻意取捨——5xx 可能其實已處理（如 Apify 已觸發 run），重試恐重複副作用。
export async function fetchWithRetry(
  input: string | URL,
  init: RequestInit = {},
  timeoutMs = 8000,
  attempts = 3
): Promise<Response> {
  let res = await fetchWithTimeout(input, init, timeoutMs);
  for (let i = 1; i < attempts && res.status === 429; i++) {
    const waitMs = retryAfterMs(res.headers.get("retry-after")) ?? 1000 * 2 ** (i - 1);
    await new Promise((r) => setTimeout(r, Math.min(waitMs, 16_000)));
    res = await fetchWithTimeout(input, init, timeoutMs);
  }
  return res;
}
