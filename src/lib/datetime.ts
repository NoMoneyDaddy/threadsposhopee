// datetime-local 輸入沒有時區資訊，呈現給使用者的是台北牆鐘時間；一律以 +08:00 解讀，
// 不受瀏覽器所在時區影響（全站時區 Asia/Taipei）。前後端共用，避免兩份解讀分歧。
// 驗證格式（YYYY-MM-DDTHH:mm，秒可選），不符回 Invalid Date（呼叫端以 isNaN 判斷），
// 避免對含秒輸入硬拼 ":00" 造成無效字串。
export function parseTaipeiDateTimeLocal(value: string): Date {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!m) return new Date(NaN);
  const [, date, hh, mm, ss = "00"] = m;
  return new Date(`${date}T${hh}:${mm}:${ss}+08:00`);
}
