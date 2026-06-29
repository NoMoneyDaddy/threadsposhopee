/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 不外露框架指紋（移除 X-Powered-By: Next.js）。
  poweredByHeader: false,
  // 內建排程用：啟用 instrumentation hook（Next 14）。見 src/instrumentation.ts。
  experimental: { instrumentationHook: true },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.cloudinary.com" },
      { protocol: "https", hostname: "**.cdninstagram.com" },
      { protocol: "https", hostname: "**.fbcdn.net" }
    ]
  },
  // 發文／素材／草稿三頁已整併進「工作台」單頁看板（/pipeline）；舊路由永久導向，
  // 保留舊書籤/外部連結可用。API 路由（/api/*）不受影響。
  async redirects() {
    return [
      { source: "/drafts", destination: "/pipeline", permanent: true },
      { source: "/compose", destination: "/pipeline", permanent: true },
      { source: "/materials", destination: "/pipeline", permanent: true }
    ];
  },
  // 安全標頭（縱深防禦）：防點擊劫持、MIME 嗅探、referrer 洩漏、過度權限、強制 HTTPS。
  // 不設嚴格 CSP（需 nonce 且易與 AdSense／字體／Next inline 衝突），留作後續以 nonce 導入。
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // HSTS：強制 HTTPS、防 SSL strip 降級。站台僅以 HTTPS 服務，含子網域；
          // 不加 preload（需主動提交 preload list 且涵蓋 apex，避免誤暗示已收錄）。
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }
        ]
      }
    ];
  }
};

module.exports = nextConfig;
