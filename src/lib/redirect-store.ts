// go2read 中轉導流資料層（redirect_links）。多租戶：建立/列出帶 ownerId 過濾；
// 依 code 取用為「對外公開」（訪客點短連結，不帶 owner）。外部 URL 一律過 SSRF 守衛。
import { getServiceClient } from "./supabase/server";
import { isDemoMode } from "./env";
import { assertSafePublicUrl } from "./url-guard";
import { randomShortCode } from "./shortcode";
import { fetchLinkPreview } from "@/services/og/preview";
import { checkUrlSafety, type SafetyVerdict } from "@/services/safety/safe-browsing";
import { log } from "./logger";

// PostgREST 在欄位不存在（含 migration 尚未套用、或 schema cache 未刷新）時，回 code PGRST204
// 且訊息形如 "Could not find the 'safety' column of 'redirect_links' in the schema cache"。
// 純函式可單測：判斷某次 insert 失敗是否因為指定欄位尚不存在。
export function isMissingColumnError(error: { code?: string; message?: string } | null, column: string): boolean {
  if (!error) return false;
  // 一律要求錯誤訊息提到「目標欄位名」，避免把其他欄位/無關的 schema 錯誤誤判為「safety 缺失」而走降級。
  const msg = (error.message ?? "").toLowerCase();
  const mentionsColumn = msg.includes(`'${column.toLowerCase()}'`);
  return mentionsColumn && (error.code === "PGRST204" || msg.includes("schema cache"));
}

export interface RedirectLinkInput {
  sourceUrl: string;
  affiliateUrl?: string | null;
  title?: string | null;
  imageUrl?: string | null;
  description?: string | null;
}

export interface RedirectLink {
  code: string;
  sourceUrl: string;
  affiliateUrl: string | null;
  title: string | null;
  imageUrl: string | null;
  description: string | null;
  // 來源安全掃描結果：'safe'｜'unsafe'｜null（未掃描/降級＝基本檢查）。中轉頁顯示信任標章用。
  safety: "safe" | "unsafe" | null;
}

export interface RedirectLinkRow extends RedirectLink {
  clicks: number;
  continues: number;
  createdAt: string;
  inBio: boolean;
}

export interface BioPage {
  title: string | null;
  links: { code: string; title: string | null; imageUrl: string | null }[];
}

// 補齊預覽欄位：使用者自填的優先；缺的才從來源 OG 自動抓（任一缺即抓一次，best-effort）。
async function resolvePreviewMeta(
  input: RedirectLinkInput
): Promise<{ title: string | null; imageUrl: string | null; description: string | null }> {
  let title = input.title ?? null;
  let imageUrl = input.imageUrl ?? null;
  let description = input.description ?? null;
  if (!title || !imageUrl || !description) {
    const og = await fetchLinkPreview(input.sourceUrl);
    title = title ?? og.title;
    imageUrl = imageUrl ?? og.imageUrl;
    description = description ?? og.description;
  }
  return { title, imageUrl, description };
}

// 建立短連結：驗證 URL（SSRF/協定），產生唯一 code（衝突重試），回傳 code。
export async function createRedirectLink(
  ownerId: string,
  input: RedirectLinkInput,
  opts: { fetchPreview?: boolean } = {}
): Promise<string> {
  // 來源必填、分潤選填；皆須為安全公開 URL（擋內網/非法協定/開放重定向濫用）。
  assertSafePublicUrl(input.sourceUrl);
  if (input.affiliateUrl) assertSafePublicUrl(input.affiliateUrl);

  // demo 模式不落 DB、也不對外抓取（避免示範環境產生外部副作用/延遲）。
  if (isDemoMode) return randomShortCode();

  // 自動預覽＋安全掃描：未自填預覽時 best-effort 抓 OG；同時用 Safe Browsing 掃來源網址（信任標章用）。
  // 兩者並行（互不阻塞）；batch 流程（一鍵套轉址）關閉以避免逐筆阻塞，安全標章則留 null（基本檢查）。
  const skip = opts.fetchPreview === false;
  const [meta, safety] = await Promise.all([
    skip
      ? Promise.resolve({ title: input.title ?? null, imageUrl: input.imageUrl ?? null, description: input.description ?? null })
      : resolvePreviewMeta(input),
    skip ? Promise.resolve<SafetyVerdict>("unknown") : checkUrlSafety(input.sourceUrl)
  ]);
  // unknown（未設金鑰/查詢失敗）存 null＝中轉頁降級為「基本安全檢查」；只有明確 safe/unsafe 才落值。
  const safetyValue: "safe" | "unsafe" | null = safety === "safe" || safety === "unsafe" ? safety : null;
  const sb = getServiceClient()!;
  // 安全欄位（migration 0049）若尚未套用到正式 DB，insert 帶 safety 會整批失敗。
  // safety 只是 best-effort 信任標章，不該卡死核心「建立短連結」：偵測到欄位缺失就降級為不帶 safety 重試。
  let includeSafety = true;
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = randomShortCode();
    const row: Record<string, unknown> = {
      owner_id: ownerId,
      code,
      source_url: input.sourceUrl,
      affiliate_url: input.affiliateUrl ?? null,
      title: meta.title,
      image_url: meta.imageUrl,
      description: meta.description
    };
    if (includeSafety) {
      row.safety = safetyValue;
      row.safety_checked_at = safetyValue ? new Date().toISOString() : null;
    }
    const { error } = await sb.from("redirect_links").insert(row);
    if (!error) return code;
    // 唯一鍵衝突（code 重複）→ 換一個重試。
    if (error.code === "23505") continue;
    // safety/safety_checked_at 欄位尚未遷移 → 降級為不帶 safety 重試（標章退回「基本安全檢查」）。
    if (includeSafety && (isMissingColumnError(error, "safety") || isMissingColumnError(error, "safety_checked_at"))) {
      log.warn("redirect_links.safety 欄位不存在（migration 0049 未套用？），改用無安全欄位建立短連結", { ownerId, code, pgCode: error.code });
      includeSafety = false;
      continue;
    }
    throw new Error(`建立短連結失敗：${error.message}`);
  }
  throw new Error("短碼產生衝突過多，請重試");
}

const LINK_COLS = "code, source_url, affiliate_url, title, image_url, description";
const toSafety = (v: unknown): "safe" | "unsafe" | null => (v === "safe" || v === "unsafe" ? v : null);

// 依 code 取用（對外公開：中轉頁渲染用，不帶 owner 過濾）。
// 與 insert 對稱：safety 欄位若尚未遷移（PGRST204）就改用不含 safety 的查詢重試（標章退回 null）；
// 其餘查詢錯誤照拋——不可被當成「找不到」而誤成 404（呼叫端只在回 null 時才 notFound）。
export async function getRedirectLinkByCode(code: string): Promise<RedirectLink | null> {
  if (isDemoMode) return null;
  const sb = getServiceClient()!;
  let res = await sb.from("redirect_links").select(`${LINK_COLS}, safety`).eq("code", code).maybeSingle();
  if (res.error && isMissingColumnError(res.error, "safety")) {
    res = await sb.from("redirect_links").select(LINK_COLS).eq("code", code).maybeSingle();
  }
  if (res.error) throw new Error(`讀取短連結失敗：${res.error.message}`);
  const data = res.data as unknown as Record<string, unknown> | null;
  if (!data) return null;
  return {
    code: data.code as string,
    sourceUrl: data.source_url as string,
    affiliateUrl: (data.affiliate_url as string) ?? null,
    title: (data.title as string) ?? null,
    imageUrl: (data.image_url as string) ?? null,
    description: (data.description as string) ?? null,
    safety: toSafety(data.safety)
  };
}

// 列出某 owner 的短連結（含統計），新到舊。
export async function listRedirectLinks(ownerId: string, limit = 100): Promise<RedirectLinkRow[]> {
  if (isDemoMode) return [];
  const sb = getServiceClient()!;
  const stats = "clicks, continues, created_at, in_bio";
  const q = (cols: string) =>
    sb.from("redirect_links").select(cols).eq("owner_id", ownerId).order("created_at", { ascending: false }).limit(limit);
  // 與 insert/讀取對稱：safety 欄位未遷移就改用不含 safety 的查詢；其餘錯誤照拋（不要把查詢失敗誤呈現成空列表）。
  let res = await q(`${LINK_COLS}, safety, ${stats}`);
  if (res.error && isMissingColumnError(res.error, "safety")) {
    res = await q(`${LINK_COLS}, ${stats}`);
  }
  if (res.error) throw new Error(`列出短連結失敗：${res.error.message}`);
  return ((res.data as unknown as Record<string, unknown>[]) ?? []).map((d) => ({
    code: d.code as string,
    sourceUrl: d.source_url as string,
    affiliateUrl: (d.affiliate_url as string) ?? null,
    title: (d.title as string) ?? null,
    imageUrl: (d.image_url as string) ?? null,
    description: (d.description as string) ?? null,
    safety: toSafety(d.safety),
    clicks: d.clicks as number,
    continues: d.continues as number,
    createdAt: d.created_at as string,
    inBio: Boolean(d.in_bio)
  }));
}

// 編輯短連結（多租戶：以 owner_id 過濾，只動得到自己的列）。短碼不變，只改目的地/分潤/標題；
// 刻意不動 image_url/description（避免編輯時把既有預覽圖/描述清空）。
// URL 一律過 SSRF 守衛；回傳是否命中該 owner 的列（達成擁有權檢查）。
export async function updateRedirectLink(
  code: string,
  ownerId: string,
  input: Pick<RedirectLinkInput, "sourceUrl" | "affiliateUrl" | "title">
): Promise<boolean> {
  assertSafePublicUrl(input.sourceUrl);
  if (input.affiliateUrl) assertSafePublicUrl(input.affiliateUrl);
  if (isDemoMode) return true;
  const sb = getServiceClient()!;
  const { data, error } = await sb
    .from("redirect_links")
    .update({
      source_url: input.sourceUrl,
      affiliate_url: input.affiliateUrl ?? null,
      title: input.title ?? null
    })
    .eq("code", code)
    .eq("owner_id", ownerId)
    .select("code")
    .maybeSingle();
  if (error) throw new Error(`更新短連結失敗：${error.message}`);
  return Boolean(data);
}

// 刪除短連結（多租戶：以 owner_id 過濾）。回傳是否命中（找不到/非本人＝false）。
export async function deleteRedirectLink(code: string, ownerId: string): Promise<boolean> {
  if (isDemoMode) return true;
  const sb = getServiceClient()!;
  const { data, error } = await sb
    .from("redirect_links")
    .delete()
    .eq("code", code)
    .eq("owner_id", ownerId)
    .select("code")
    .maybeSingle();
  if (error) throw new Error(`刪除短連結失敗：${error.message}`);
  return Boolean(data);
}

// 開關某短連結是否顯示在 bio 頁（多租戶：以 owner_id 過濾）。
export async function setRedirectInBio(code: string, ownerId: string, on: boolean): Promise<boolean> {
  if (isDemoMode) return true;
  const sb = getServiceClient()!;
  const { data } = await sb
    .from("redirect_links")
    .update({ in_bio: on })
    .eq("code", code)
    .eq("owner_id", ownerId)
    .select("code")
    .maybeSingle();
  return Boolean(data);
}

// 公開 bio 頁：依 handle 取該使用者的標題與「已加入 bio」的短連結。找不到回 null。
export async function getBioPageByHandle(handle: string): Promise<BioPage | null> {
  if (isDemoMode) return null;
  const sb = getServiceClient()!;
  const { data: prof } = await sb
    .from("profiles")
    .select("id, bio_title")
    .eq("bio_handle", handle.toLowerCase())
    .maybeSingle();
  if (!prof) return null;
  const { data: links } = await sb
    .from("redirect_links")
    .select("code, title, image_url")
    .eq("owner_id", prof.id)
    .eq("in_bio", true)
    .order("created_at", { ascending: false })
    .limit(50);
  return {
    title: prof.bio_title ?? null,
    links: (links ?? []).map((l) => ({ code: l.code, title: l.title, imageUrl: l.image_url }))
  };
}

// 原子累加中轉頁瀏覽數（best-effort，不擋頁）。
export async function bumpRedirectClick(code: string): Promise<void> {
  if (isDemoMode) return;
  const sb = getServiceClient()!;
  await sb.rpc("bump_redirect_click", { p_code: code });
}

// 原子累加「繼續」數（best-effort）。
export async function bumpRedirectContinue(code: string): Promise<void> {
  if (isDemoMode) return;
  const sb = getServiceClient()!;
  await sb.rpc("bump_redirect_continue", { p_code: code });
}
