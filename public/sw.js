// 極簡 service worker：僅為 PWA 可安裝性（manifest + 已註冊 SW + fetch handler）。
// 不做快取，全部直通網路，避免登入態/即時資料被舊快取污染。
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  // 直通：不攔截、不快取。存在即滿足可安裝性需求。
});
