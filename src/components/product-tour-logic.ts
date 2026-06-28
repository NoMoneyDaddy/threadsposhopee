// 互動導覽的純邏輯與常數（無 React／next 依賴，方便 node:test 直接測，且不把 ProductTour
// 拖進 TourLaunchButton 的靜態相依圖）。
export const TOUR_STORAGE_KEY = "iwantpo.tour.v1";
export const TOUR_OPEN_EVENT = "iwantpo:open-tour";

// 是否首次自動開啟導覽：要求 auto 開啟、且使用者尚未看過（localStorage 無 seen flag）。
export function shouldAutoOpenTour(auto: boolean, seen: string | null): boolean {
  return Boolean(auto) && !seen;
}
