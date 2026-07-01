// 把常見的上游錯誤碼/訊息對應成白話說明，附在原始錯誤旁，讓使用者知道「怎麼回事、要不要動作」。
// 找不到對應回 null（只顯示原始錯誤）。純函式、可測；不改原始訊息（原碼仍保留供除錯）。
export function explainError(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase();

  // AI（Gemini）過載／配額
  if (/\b503\b|unavailable|high demand|experiencing high/.test(s) && /(gemini|ai|model|生成|文案|串文)/.test(s)) {
    return "AI 模型暫時過載，系統會自動重試，通常稍後就會成功。";
  }
  if (/\b429\b|quota|rate.?limit|resource_exhausted|配額/.test(s)) {
    return "已達配額或速率上限（多為「每分鐘」限制），請稍等一下再試。";
  }
  // Threads 容器尚未就緒（剛建立就發布的競態）
  if (/"code":\s*24|4279009|does not exist|見つかり|找不到.*媒體|媒體.*找不到/.test(s)) {
    return "Threads 媒體容器尚未就緒，系統已自動重試；若持續失敗，稍後再發即可。";
  }
  // Threads 授權過期／無效
  if (/\b190\b|access token|oauth|token.*(expire|invalid)|expired|過期|unauthor/.test(s)) {
    return "Threads 授權可能過期或無效，請到「帳號管理」重新貼上 token。";
  }
  // 一般分類（放最後，避免蓋掉上面更精準的對應）
  if (/\b5\d\d\b|timeout|timed out|逾時|econn|network|fetch failed/.test(s)) {
    return "對方服務暫時異常或連線逾時，稍後重試通常可恢復。";
  }
  if (/\b4\d\d\b/.test(s)) {
    return "請求被對方服務拒絕（4xx），多為參數或權限問題；可重試或檢查帳號授權。";
  }
  return null;
}
