/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 內建排程用：啟用 instrumentation hook（Next 14）。見 src/instrumentation.ts。
  experimental: { instrumentationHook: true },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.cloudinary.com" },
      { protocol: "https", hostname: "**.cdninstagram.com" },
      { protocol: "https", hostname: "**.fbcdn.net" }
    ]
  },
  // 安全標頭（縱深防禦）：防點擊劫持、MIME 嗅探、referrer 洩漏、過度權限。
  // 不設嚴格 CSP（需 nonce 且易與 AdSense／字體／Next inline 衝突），留作後續以 nonce 導入。
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" }
        ]
      }
    ];
  }
};

module.exports = nextConfig;
