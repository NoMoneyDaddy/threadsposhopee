// 匯入額度（give-to-get）：初始只能匯入基礎額度；每分享 1 篇素材到共享庫解鎖更多匯入。
// 純函式可測。鼓勵上傳分享、避免「只拿不給」把共享庫吸乾。
export const BASE_IMPORT_ALLOWANCE = 5; // 初始（0 分享）可匯入篇數
export const IMPORTS_PER_SHARE = 3; // 每分享 1 篇素材，額度 +3

export function importAllowance(sharedCount: number): number {
  return BASE_IMPORT_ALLOWANCE + Math.max(0, Math.floor(sharedCount)) * IMPORTS_PER_SHARE;
}
