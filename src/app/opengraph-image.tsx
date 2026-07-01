import { ImageResponse } from "next/og";

// 分享連結預覽圖（1200×630），動態產生不需準備靜態檔。
// 註：ImageResponse 內建字型無中文字符（會變豆腐方塊），故圖內只用拉丁字／符號；
// 中文標題與說明走 og:title／og:description meta，由各平台以自己的字型渲染。
export const runtime = "edge";
export const alt = "IwantPo — 多帳號社群排程・AI 文案・分潤管理";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          color: "#fff",
          fontFamily: "sans-serif",
          background: "linear-gradient(135deg, #4f46e5 0%, #6366f1 45%, #8b5cf6 100%)"
        }}
      >
        <div style={{ fontSize: 124, fontWeight: 700, letterSpacing: -2, lineHeight: 1 }}>IwantPo</div>
        <div style={{ marginTop: 28, fontSize: 46, fontWeight: 600, opacity: 0.96 }}>
          Schedule · AI Copy · Affiliate
        </div>
        <div style={{ marginTop: 16, fontSize: 30, opacity: 0.82 }}>
          Multi-account social posting, on autopilot.
        </div>
        <div style={{ marginTop: "auto", fontSize: 26, opacity: 0.7 }}>iwantpo.nomoneydaddy.app</div>
      </div>
    ),
    size
  );
}
