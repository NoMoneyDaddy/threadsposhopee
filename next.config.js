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
  }
};

module.exports = nextConfig;
