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
