// 極簡 service worker：僅為 PWA 可安裝性（manifest + 已註冊 SW + fetch handler）。
// 不做快取，全部直通網路，避免登入態/即時資料被舊快取污染。
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  // 直通：不攔截、不快取。存在即滿足可安裝性需求。
});

// Web Push：顯示伺服器送來的通知（payload 為 {title, body, url}）。
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "IwantPo";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icon.svg",
      badge: "/icon.svg",
      data: { url: data.url || "/" }
    })
  );
});

// 點通知 → 聚焦既有分頁或開新分頁到指定網址。
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
