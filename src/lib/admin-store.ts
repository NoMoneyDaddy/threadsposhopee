// 管理員／身份組資料層：身份組賦予、熱設定旗標（存 DB，不隨重新部署消失）、站台統計、貢獻排行榜。
// 權限把關在 API/頁面層（owner email = 管理員；reviewer 由管理員賦予）。
import { getServiceClient } from "./supabase/server";
import { isDemoMode } from "./env";
import { sanitizeRoles, type ManualRole } from "./roles";

// ── 身份組 ────────────────────────────────────────────────
export async function getRoles(ownerId: string): Promise<ManualRole[]> {
  if (isDemoMode) return [];
  const sb = getServiceClient()!;
  const { data } = await sb.from("profiles").select("roles").eq("id", ownerId).maybeSingle();
  return sanitizeRoles(data?.roles);
}

// 依 email 找使用者 id（管理員賦予身份組用；分頁掃描）。
export async function resolveUserIdByEmail(email: string): Promise<string | null> {
  if (isDemoMode) return null;
  const sb = getServiceClient()!;
  const target = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`查詢使用者失敗：${error.message}`);
    const u = data.users.find((x) => x.email?.toLowerCase() === target);
    if (u) return u.id;
    if (data.users.length < 200) break;
  }
  return null;
}

// 設定某使用者的身份組（覆寫；只接受合法身份組）。
export async function setRoles(ownerId: string, roles: ManualRole[]): Promise<void> {
  if (isDemoMode) return;
  const sb = getServiceClient()!;
  const { error } = await sb.from("profiles").upsert({ id: ownerId, roles }, { onConflict: "id" });
  if (error) throw new Error(`設定身份組失敗：${error.message}`);
}

// ── 熱設定旗標（feature flags，存 app_state，改了立即生效、不隨重新部署消失）────
export type FeatureFlags = {
  shared: boolean; // 共享素材庫
  leaderboard: boolean; // 貢獻排行榜
  favorites: boolean; // 收藏功能
};
export const DEFAULT_FLAGS: FeatureFlags = { shared: true, leaderboard: true, favorites: true };
const FLAGS_KEY = "feature_flags";

export async function getFeatureFlags(): Promise<FeatureFlags> {
  if (isDemoMode) return { ...DEFAULT_FLAGS };
  const sb = getServiceClient()!;
  const { data } = await sb.from("app_state").select("value").eq("key", FLAGS_KEY).maybeSingle();
  if (!data?.value) return { ...DEFAULT_FLAGS };
  try {
    const parsed = JSON.parse(data.value) as Partial<FeatureFlags>;
    return { ...DEFAULT_FLAGS, ...parsed };
  } catch {
    return { ...DEFAULT_FLAGS };
  }
}

export async function setFeatureFlags(patch: Partial<FeatureFlags>): Promise<FeatureFlags> {
  const cur = await getFeatureFlags();
  const next: FeatureFlags = {
    shared: typeof patch.shared === "boolean" ? patch.shared : cur.shared,
    leaderboard: typeof patch.leaderboard === "boolean" ? patch.leaderboard : cur.leaderboard,
    favorites: typeof patch.favorites === "boolean" ? patch.favorites : cur.favorites
  };
  if (isDemoMode) return next;
  const sb = getServiceClient()!;
  const { error } = await sb
    .from("app_state")
    .upsert({ key: FLAGS_KEY, value: JSON.stringify(next), updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(`儲存站台設定失敗：${error.message}`);
  return next;
}

// ── 站台統計（管理員儀表板）────────────────────────────────
export type AdminStats = {
  members: number; // 註冊會員數
  threadsAccounts: number; // Threads 帳號數
  drafts: number; // 草稿總數
  published: number; // 已發布草稿數
  sharedMaterials: number; // 共享中素材數
  totalImports: number; // 共享匯入總次數
};

export async function getAdminStats(): Promise<AdminStats> {
  if (isDemoMode) {
    return { members: 1, threadsAccounts: 0, drafts: 0, published: 0, sharedMaterials: 0, totalImports: 0 };
  }
  const sb = getServiceClient()!;
  let members = 0;
  for (let page = 1; page <= 50; page++) {
    const { data } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    members += data.users.length;
    if (data.users.length < 200) break;
  }
  const head = { count: "exact" as const, head: true };
  const [threadsAccounts, drafts, published, sharedMaterials, totalImports] = await Promise.all([
    sb.from("threads_accounts").select("*", head).then((r) => r.count ?? 0),
    sb.from("drafts").select("*", head).then((r) => r.count ?? 0),
    sb.from("drafts").select("*", head).eq("status", "published").then((r) => r.count ?? 0),
    sb.from("materials").select("*", head).eq("shared", true).neq("review_status", "removed").then((r) => r.count ?? 0),
    sumImportCount()
  ]);
  return { members, threadsAccounts, drafts, published, sharedMaterials, totalImports };
}

async function sumImportCount(): Promise<number> {
  const sb = getServiceClient()!;
  const { data } = await sb.rpc("top_contributors", { p_limit: 100000 });
  return ((data ?? []) as { score: number }[]).reduce((a, r) => a + (r.score ?? 0), 0);
}

// 週報廣播用：列出有綁通知通道（Telegram 或 Discord）的使用者 id（明文欄位，非機密）。
export async function listOwnersWithNotify(limit = 500): Promise<string[]> {
  if (isDemoMode) return [];
  const sb = getServiceClient()!;
  const { data } = await sb
    .from("profiles")
    .select("id, telegram_chat_id, discord_webhook_url")
    .or("telegram_chat_id.not.is.null,discord_webhook_url.not.is.null")
    .limit(limit);
  return (data ?? []).map((r) => r.id as string);
}

// ── 貢獻排行榜 ────────────────────────────────────────────
export type Contributor = { owner_id: string; score: number; bio_handle: string | null };
export async function listTopContributors(limit = 10): Promise<Contributor[]> {
  if (isDemoMode) return [];
  const sb = getServiceClient()!;
  const { data, error } = await sb.rpc("top_contributors", { p_limit: limit });
  if (error) throw new Error(`取得排行榜失敗：${error.message}`);
  return (data ?? []) as Contributor[];
}
