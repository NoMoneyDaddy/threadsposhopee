import type { Metadata } from "next";

export const metadata: Metadata = { title: "資料刪除 — IwantPo" };

// 公開的資料刪除說明頁（Meta 資料刪除回呼會把使用者導到這裡）。
export default function DataDeletionPage({ searchParams }: { searchParams: { id?: string } }) {
  const id = searchParams.id;
  return (
    <div className="mx-auto max-w-2xl space-y-6 py-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">資料刪除</h1>
        <p className="text-sm text-ink-3">Data Deletion</p>
      </header>
      <div className="space-y-3 text-sm leading-relaxed text-ink-2">
        <p>
          當你從 Threads 移除本 App 的授權，或送出資料刪除請求時，我們會
          <strong className="text-ink">立即刪除</strong>所儲存、與該 Threads 帳號相關的存取權杖與發布紀錄。
        </p>
        {id ? (
          <p className="rounded-xl border border-border bg-surface px-4 py-3">
            你的刪除確認碼：<code className="font-mono text-ink">{id}</code>
            <br />
            與此 Threads 帳號相關的資料已刪除。
          </p>
        ) : (
          <p>
            若要主動刪除資料：到 Threads「設定 → 網站權限」移除本 App 即可；或在本服務的「帳號管理」中移除已綁定的帳號。
          </p>
        )}
        <p>本服務不販售你的個人資料，亦不會用於提供功能以外的用途（詳見隱私權政策）。</p>
      </div>
    </div>
  );
}
