// 贊助文內容安全預檢：命中「明顯違規/高風險」關鍵字的貼文，就不把平台分潤連結放上去
// （改走使用者原本連結），避免有人用違規內容拖累平台的蝦皮分潤帳號被檢舉。
// 保守、只擋明顯違規；純函式可測。詞庫可日後於管理員設定擴充。
const RISKY_PATTERNS: RegExp[] = [
  /成人|情色|色情|裸露|18\s*禁|av女/i,
  /賭博|博弈|娛樂城|百家樂|下注|包牌|六合彩/i,
  /詐騙|洗錢|代儲|刷單|買粉|養號|貸款免審/i,
  /毒品|大麻|安非他命|槍枝|軍火/i,
  /仇恨|歧視|恐怖(攻擊|主義)/i,
  /私菸|水貨走私|盜版|假貨代購/i
];

export function isRiskySponsorContent(text: string | null | undefined): boolean {
  if (!text) return false;
  return RISKY_PATTERNS.some((re) => re.test(text));
}
