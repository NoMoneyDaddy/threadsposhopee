// 本站不收費（營收來自廣告／贊助文系統），無方案分層。
// 帳號上限改為固定常數：一般使用者每人可連結的 Threads 發文帳號上限；
// 管理者（部署擁有者）取較高的全站硬上限（資源保護，避免單人爆量造成排隊）。
export const MAX_THREADS_ACCOUNTS_PER_USER = 10;
export const GLOBAL_MAX_THREADS_ACCOUNTS = 20;

// 單一來源：依是否為管理者回傳可連結的 Threads 發文帳號上限。
// UI（帳號頁徽章）與後端（canAddThreadsAccount）共用，避免規則脫鉤。
export function getThreadsAccountLimit(isOwner: boolean | undefined): number {
  return isOwner ? GLOBAL_MAX_THREADS_ACCOUNTS : MAX_THREADS_ACCOUNTS_PER_USER;
}
