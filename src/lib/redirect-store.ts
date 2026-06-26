// go2read 中轉導流資料層（redirect_links）。多租戶：建立/列出帶 ownerId 過濾；
// 依 code 取用為「對外公開」（訪客點短連結，不帶 owner）。外部 URL 一律過 SSRF 守衛。
import { getServiceClient } from "./supabase/server";
import { isDemoMode } from "./env";
import { assertSafePublicUrl } from "./url-guard";
import { randomShortCode } from "./shortcode";
import { fetchLinkPreview } from "@/services/og/preview";

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

  // 自動預覽：使用者未自填標題/預覽圖/描述時，best-effort 抓來源 OG 帶入（供中轉頁與 Threads unfurl）。
  // batch 流程（一鍵套轉址）可關閉以避免逐筆阻塞；預設開啟。
  const meta = opts.fetchPreview === false ? { title: input.title ?? null, imageUrl: input.imageUrl ?? null, description: input.description ?? null } : await resolvePreviewMeta(input);
  const sb = getServiceClient()!;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomShortCode();
    const { error } = await sb.from("redirect_links").insert({
      owner_id: ownerId,
      code,
      source_url: input.sourceUrl,
      affiliate_url: input.affiliateUrl ?? null,
      title: meta.title,
      image_url: meta.imageUrl,
      description: meta.description
    });
    if (!error) return code;
    // 唯一鍵衝突（code 重複）→ 換一個重試；其餘錯誤直接拋出。
    if (error.code !== "23505") throw new Error(`建立短連結失敗：${error.message}`);
  }
  throw new Error("短碼產生衝突過多，請重試");
}

// 依 code 取用（對外公開：中轉頁渲染用，不帶 owner 過濾）。
export async function getRedirectLinkByCode(code: string): Promise<RedirectLink | null> {
  if (isDemoMode) return null;
  const sb = getServiceClient()!;
  const { data } = await sb
    .from("redirect_links")
    .select("code, source_url, affiliate_url, title, image_url, description")
    .eq("code", code)
    .maybeSingle();
  if (!data) return null;
  return {
    code: data.code,
    sourceUrl: data.source_url,
    affiliateUrl: data.affiliate_url,
    title: data.title,
    imageUrl: data.image_url,
    description: data.description
  };
}

// 列出某 owner 的短連結（含統計），新到舊。
export async function listRedirectLinks(ownerId: string, limit = 100): Promise<RedirectLinkRow[]> {
  if (isDemoMode) return [];
  const sb = getServiceClient()!;
  const { data } = await sb
    .from("redirect_links")
    .select("code, source_url, affiliate_url, title, image_url, description, clicks, continues, created_at, in_bio")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((d) => ({
    code: d.code,
    sourceUrl: d.source_url,
    affiliateUrl: d.affiliate_url,
    title: d.title,
    imageUrl: d.image_url,
    description: d.description,
    clicks: d.clicks,
    continues: d.continues,
    createdAt: d.created_at,
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
