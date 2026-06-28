import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Go2readMark, G2R_FONT } from "./brand";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "go2read — 安全連結中轉服務",
  description: "go2read 在你前往目標頁面前做一次安全檢查與揭露，讓分享的連結更安心。",
  robots: { index: true, follow: true }
};

// go2read 獨立服務首頁（短網域 go2read.link 的根目錄）。視覺與主站完全分離：
// 自有青綠識別、自有字體、SVG 圖示，不顯示主站品牌/導覽，也不外露主站任何頁面。
function Feature({ icon, title, desc }: { icon: ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 text-left ring-1 ring-[#d6e6ea] shadow-[0_10px_30px_-18px_rgba(6,78,90,0.4)]">
      <span aria-hidden className="grid h-9 w-9 place-items-center rounded-xl bg-[#e6f6f8] text-[#0e7490]">
        {icon}
      </span>
      <h3 className="mt-3 text-sm font-semibold text-[#0c3543]" style={{ fontFamily: G2R_FONT }}>{title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-[#48707c]">{desc}</p>
    </div>
  );
}

// 統一的 SVG icon 外框（stroke 風格，與盾牌標誌同調）。
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

export default function Go2readHome() {
  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center bg-gradient-to-b from-[#f1f8fa] to-[#e2eef1] px-4 py-12">
      <main className="relative w-full max-w-xl text-center">
        <div className="mb-6 flex flex-col items-center gap-3">
          <Go2readMark size={56} />
          <h1 className="text-3xl font-bold tracking-tight text-[#0c3543]" style={{ fontFamily: G2R_FONT }}>go2read</h1>
          <p className="text-sm font-medium text-[#0e7490]">安全連結中轉服務</p>
        </div>

        <p className="mx-auto max-w-md text-sm leading-relaxed text-[#48707c]">
          go2read 是一個<b className="text-[#0c3543]">連結中轉服務</b>：當你點開一個 go2read 短連結，我們會在帶你前往目標頁面前，
          先做一次<b className="text-[#0c3543]">安全檢查</b>並清楚<b className="text-[#0c3543]">揭露你即將前往的網址</b>，讓分享與點擊都更安心。
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <Feature
            icon={<Icon><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3Z" /><path d="m9 12 2 2 4-4" /></Icon>}
            title="安全檢查"
            desc="前往前先檢查目標連結，命中威脅名單會醒目警告、不自動跳轉。"
          />
          <Feature
            icon={<Icon><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></Icon>}
            title="透明揭露"
            desc="中轉頁清楚顯示你即將前往的網址，沒有偽裝或欺騙性彈窗。"
          />
          <Feature
            icon={<Icon><path d="M13 2 4.5 12.5a1 1 0 0 0 .8 1.6H11l-1 7.9 8.5-10.5a1 1 0 0 0-.8-1.6H12l1-7.9Z" /></Icon>}
            title="一鍵前往"
            desc="確認後一次點擊即前往目標內容；本服務由廣告維運。"
          />
        </div>

        <p className="mt-8 text-xs text-[#7ba0aa]">
          你是被某個 go2read 短連結帶來這裡的嗎？短連結格式為 <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[#0e7490] ring-1 ring-[#d6e6ea]">go2read.link/r/代碼</code>。
        </p>
      </main>

      <footer className="relative mt-10 text-[11px] text-[#7ba0aa]">© go2read · 安全連結中轉服務</footer>
    </div>
  );
}
