// go2read 中轉導流資料層（redirect_links）。多租戶：建立/列出帶 ownerId 過濾；
// 依 code 取用為「對外公開」（訪客點短連結，不帶 owner）。外部 URL 一律過 SSRF 守衛。
import { getServiceClient } from "./supabase/server";
import { isDemoMode } from "./env";
import { assertSafePublicUrl } from "./url-guard";
import { randomShortCode } from "./shortcode";

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
}

// 建立短連結：驗證 URL（SSRF/協定），產生唯一 code（衝突重試），回傳 code。
export async function createRedirectLink(ownerId: string, input: RedirectLinkInput): Promise<string> {
  // 來源必填、分潤選填；皆須為安全公開 URL（擋內網/非法協定/開放重定向濫用）。
  assertSafePublicUrl(input.sourceUrl);
  if (input.affiliateUrl) assertSafePublicUrl(input.affiliateUrl);

  if (isDemoMode) return randomShortCode();
  const sb = getServiceClient()!;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomShortCode();
    const { error } = await sb.from("redirect_links").insert({
      owner_id: ownerId,
      code,
      source_url: input.sourceUrl,
      affiliate_url: input.affiliateUrl ?? null,
      title: input.title ?? null,
      image_url: input.imageUrl ?? null,
      description: input.description ?? null
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
    .select("code, source_url, affiliate_url, title, image_url, description, clicks, continues, created_at")
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
    createdAt: d.created_at
  }));
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
