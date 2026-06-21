// 短網域（go2read.link）host 判斷：讓該網域只當轉址服務，不外露主站。
// 由 NEXT_PUBLIC_SHORT_DOMAIN（如 https://go2read.link）推出 host。純函式可測。
export function shortHostOf(shortDomain: string | undefined | null): string {
  if (!shortDomain) return "";
  try {
    return new URL(shortDomain).host;
  } catch {
    return "";
  }
}

// 在短網域上「只允許」轉址相關路徑（中轉頁與其計數 beacon）。其餘回 404。
export function isAllowedOnShortHost(pathname: string): boolean {
  return pathname.startsWith("/r/") || pathname === "/api/redirect/hit";
}
