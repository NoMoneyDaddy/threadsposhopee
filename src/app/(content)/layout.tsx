import ContentTabs from "@/components/ContentTabs";
import { getCurrentUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";

// 「文章管理」頁面群組共用版型：頂部次導覽分頁（草稿/發文/AI 代理人/素材/自動抓文），
// 各分頁仍保留自己的標題與動作按鈕。URL 不變（route group 不影響路徑）。
export default async function ContentLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const isOwner = user?.isOwner ?? isDemoMode;
  return (
    <div className="space-y-4">
      <ContentTabs isOwner={isOwner} />
      {children}
    </div>
  );
}
