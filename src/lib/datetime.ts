// datetime-local 輸入沒有時區資訊，呈現給使用者的是台北牆鐘時間；一律以 +08:00 解讀，
// 不受瀏覽器所在時區影響（全站時區 Asia/Taipei）。前後端共用，避免兩份解讀分歧。
export function parseTaipeiDateTimeLocal(value: string): Date {
  return new Date(`${value}:00+08:00`);
}
