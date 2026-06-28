// go2read 獨立子服務的品牌元件與識別常數。刻意與主站視覺「完全分離」：
// 自有青綠（cyan/teal）識別、自有字體堆疊、圓角盾牌標誌，不沿用主站任何設計 token
// （--ink / --surface / accent-line / btn-brand 等）。圖示一律 SVG，全站文案不用表情符號。

// 自有字體堆疊：以 system-ui 領頭，刻意不同於主站標題的 Space Grotesk（--font-display）。
// 直接掛在各標題元素的 inline style，才能蓋過 globals.css 對 h1/h2/h3 指定的 display 字體。
export const G2R_FONT =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif';

// 盾牌＋勾：傳達「安全中轉」的信任感。size 控制外框邊長，內部 SVG 依比例縮放。
export function Go2readMark({ size = 44 }: { size?: number }) {
  const inner = Math.round(size * 0.5);
  return (
    <span
      aria-hidden
      className="grid place-items-center rounded-2xl bg-gradient-to-br from-[#06b6d4] to-[#0f9488] text-white shadow-[0_8px_22px_-6px_rgba(6,78,90,0.5)]"
      style={{ width: size, height: size }}
    >
      <svg width={inner} height={inner} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3Z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    </span>
  );
}
