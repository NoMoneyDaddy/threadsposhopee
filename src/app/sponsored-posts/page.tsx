import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listThreadsAccounts } from "@/lib/store";
import { listSponsorRecordsForOwner, sponsorRecordStatus, formatCommissionRate } from "@/lib/sponsor";
import MySponsorPostsCard, { type MySponsorPostRow } from "@/components/MySponsorPostsCard";

export const metadata: Metadata = { title: "我的贊助文 — IwantPo" };
export const dynamic = "force-dynamic";

// 獨立頁：使用者查看自己「被抽為平台贊助文」與「自賺（用自己連結）」的完整紀錄，兩者分開列出。
// 資料與設定頁卡片同源（listSponsorRecordsForOwner），此頁抓更多筆並分區、附分潤率與統計。
export default async function SponsoredPostsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/sponsored-posts");

  const accts = await listThreadsAccounts(user.id).catch(() => []);
  const labelById = new Map(accts.map((a) => [a.id, a.label]));
  const records = await listSponsorRecordsForOwner(user.id, 200).catch(() => []);

  const toRow = (e: (typeof records)[number]): MySponsorPostRow => {
    const status = sponsorRecordStatus(e.rec);
    return {
      accountLabel: labelById.get(e.accountId) ?? e.accountId,
      postId: e.rec.postId,
      link: e.rec.link,
      atText: new Date(e.rec.at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", dateStyle: "short", timeStyle: "short" }),
      statusLabel: status.label,
      statusTone: status.tone,
      rateText: formatCommissionRate(e.rec.commissionRate)
    };
  };

  // 被抽（平台贊助）：非自賺；自賺：ownLink。
  const platformRows = records.filter((e) => !e.rec.ownLink).map(toRow);
  const ownRows = records.filter((e) => e.rec.ownLink).map(toRow);

  return (
    <div className="mx-auto max-w-2xl space-y-5 py-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">我的贊助文</h1>
        <p className="text-sm text-ink-3">
          完整、透明的紀錄：哪些貼文被系統作為平台贊助文（連結替換為平台分潤連結），以及你以自己連結自賺的篇數。
          規則說明見 <Link href="/sponsored" className="text-brand underline">贊助文規則</Link>。
        </p>
      </header>

      <div className="flex flex-wrap gap-2 text-sm">
        <span className="rounded-full bg-surface-2 px-3 py-1 text-ink-2">被抽（平台贊助）<strong className="ml-1 text-ink">{platformRows.length}</strong> 篇</span>
        <span className="rounded-full bg-surface-2 px-3 py-1 text-ink-2">自賺（自己連結）<strong className="ml-1 text-ink">{ownRows.length}</strong> 篇</span>
      </div>

      <MySponsorPostsCard
        rows={platformRows}
        title="被抽為平台贊助文"
        intro="這些貼文的商品連結被替換為平台分潤連結（其餘內容不變），用以支應免費服務。含分潤率快照與驗證狀態。"
        emptyText="目前還沒有被抽為平台贊助文的紀錄。"
      />
      <MySponsorPostsCard
        rows={ownRows}
        title="自賺（用你自己的分潤連結）"
        intro="高貢獻回饋：這些篇用的是你「自己的」分潤連結，分潤歸你、不納入平台贊助。"
        emptyText="目前還沒有自賺紀錄（需達到高貢獻回饋資格）。"
      />
    </div>
  );
}
