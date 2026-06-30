// Twitter/X 大圖卡用同一張預覽圖（避免重複維護）。
// runtime 須為字面量（Next 無法解析 re-export 的值），其餘設定與產生器沿用 opengraph-image。
export const runtime = "edge";
export { alt, size, contentType, default } from "./opengraph-image";
