import type { Metadata } from "next";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "go2read — 安全連結中轉服務",
  description: "go2read 在你前往目標頁面前做一次安全檢查與揭露，讓分享的連結更安心。",
  robots: { index: true, follow: true }
};

// go2read 獨立服務首頁（短網域 go2read.link 的根目錄）。
// 與主站完全分離：不顯示主站品牌/導覽、不外露主站任何頁面；純粹介紹這個中轉服務。
function Feature({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 text-left">
      <div className="text-2xl" aria-hidden>{icon}</div>
      <h3 className="mt-2 text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-ink-2">{desc}</p>
    </div>
  );
}

export default function Go2readHome() {
  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-surface-2 px-4 py-12">
      <main className="relative w-full max-w-xl text-center">
        <div className="mb-6 flex flex-col items-center gap-2">
          <span aria-hidden className="accent-line grid h-12 w-12 place-items-center rounded-2xl text-white shadow-[var(--shadow-card)]">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2 11 13" />
              <path d="m22 2-7 20-4-9-9-4Z" />
            </svg>
          </span>
          <h1 className="text-3xl font-bold tracking-tight text-ink">go2read</h1>
          <p className="text-sm text-ink-2">安全連結中轉服務</p>
        </div>

        <p className="mx-auto max-w-md text-sm leading-relaxed text-ink-2">
          go2read 是一個<b className="text-ink">連結中轉服務</b>：當你點開一個 go2read 短連結，我們會在帶你前往目標頁面前，
          先做一次<b className="text-ink">安全檢查</b>並清楚<b className="text-ink">揭露你即將前往的網址</b>，讓分享與點擊都更安心。
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <Feature icon="🛡️" title="安全檢查" desc="前往前先檢查目標連結，命中威脅名單會醒目警告、不自動跳轉。" />
          <Feature icon="👀" title="透明揭露" desc="中轉頁清楚顯示你即將前往的網址，沒有偽裝或欺騙性彈窗。" />
          <Feature icon="⚡" title="一鍵前往" desc="確認後一次點擊即前往目標內容；本服務由廣告維運。" />
        </div>

        <p className="mt-8 text-xs text-ink-3">
          你是被某個 go2read 短連結帶來這裡的嗎？短連結格式為 <code className="font-mono">go2read.link/r/代碼</code>。
        </p>
      </main>

      <footer className="relative mt-10 text-[11px] text-ink-3">© go2read · 安全連結中轉服務</footer>
    </div>
  );
}
