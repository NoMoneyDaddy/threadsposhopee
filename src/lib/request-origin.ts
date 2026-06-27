// 從請求還原「對外公開 origin」（要註冊進 Telegram，屬信任邊界）。純函式，可單測。
// 優先用瀏覽器送的 Origin——owner 由設定頁同源 POST，middleware 已對帶 Origin 的請求驗證過，是最可信來源；
// 偽造的 x-forwarded-host 只在「無 Origin」（非瀏覽器）時才退而採用。一律強制 https（Telegram webhook 規定）。
export function publicOrigin(req: Request): string {
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).origin.replace(/^http:/, "https:");
    } catch {
      // 畸形 Origin → 落後備
    }
  }
  const fwdHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = fwdHost || req.headers.get("host")?.split(",")[0]?.trim();
  // 用 new URL 正規化（host 可能含路徑/埠等雜訊），與 Origin 分支一致取乾淨 origin。
  if (host) {
    try {
      return new URL(`https://${host}`).origin;
    } catch {
      // 畸形 host → 落到 req.url
    }
  }
  return new URL(req.url).origin.replace(/^http:/, "https:");
}
