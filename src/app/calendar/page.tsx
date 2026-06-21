import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// 行事曆已併入「草稿」頁的「已排程」分頁（UX 階段 2）。舊網址轉址，不破既有連結。
export default function CalendarPage() {
  redirect("/drafts");
}
