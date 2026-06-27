// 管理員／身份組資料層：身份組賦予、熱設定旗標（存 DB，不隨重新部署消失）、站台統計、貢獻排行榜。
// 權限把關在 API/頁面層（owner email = 管理員；reviewer 由管理員賦予）。
import { getServiceClient } from "./supabase/server";
import { isDemoMode } from "./env";
import { getRealUser, listAllUsers } from "./auth";
import { listActiveCircuits } from "./app-state";
import { listAllSponsorRecords } from "./sponsor";
import { sanitizeRoles, type ManualRole } from "./roles";

// ── 身份組 ────────────────────────────────────────────────
export async function getRoles(ownerId: string): Promise<ManualRole[]> {
  if (isDemoMode) return [];
  const sb = getServiceClient()!;
  const { data } = await sb.from("profiles").select("roles").eq("id", ownerId).maybeSingle();
  return sanitizeRoles(data?.roles);
}

// 管理頁使用者總覽（owner-only）：每位使用者的身份組與綁定帳號數。
// 以「整表各一次查詢」彙總（避免每使用者 N 次查詢）；service-role 讀全表，僅供管理頁使用。
export interface UserOverviewRow {
  id: string;
  email: string | null;
  roles: ManualRole[];
  threadsCount: number;
  shopeeBound: boolean;
}
// 整表分頁讀取（避開 Supabase 預設 1000 列上限的靜默截斷；查詢失敗即拋）。
async function selectAllRows<T>(table: string, columns: string): Promise<T[]> {
  const sb = getServiceClient()!;
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from(table).select(columns).range(from, from + PAGE - 1);
    if (error) throw new Error(`讀取 ${table} 失敗：${error.message}`);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

export async function listUsersOverview(): Promise<UserOverviewRow[]> {
  if (isDemoMode) return [];
  // 防禦式 owner 守門（除頁面層外再驗一次）：本函式以 service-role 讀全站使用者資料，
  // 若日後被其他 server action/route 誤匯入，避免跨租戶外洩。以「真實登入身分」驗證（非 view-as）。
  const actor = await getRealUser();
  if (!actor?.isPlatformOwner) throw new Error("forbidden: 僅限管理者");
  const users = await listAllUsers();
  // 各表分頁全撈，於記憶體彙總（避免每使用者 N 次查詢；分頁避免 1000 列截斷）。
  const [profiles, threads, shopee] = await Promise.all([
    selectAllRows<{ id: string; roles?: unknown }>("profiles", "id, roles"),
    selectAllRows<{ owner_id: string | null }>("threads_accounts", "owner_id"),
    selectAllRows<{ owner_id: string | null }>("shopee_accounts", "owner_id")
  ]);

  return buildUsersOverview(users, profiles, threads, shopee);
}

// 純彙總（易測）：把使用者清單與各表列彙總成總覽列。owner_id 為 null 的孤兒列略過。
export function buildUsersOverview(
  users: { id: string; email: string | null }[],
  profiles: { id: string; roles?: unknown }[],
  threads: { owner_id: string | null }[],
  shopee: { owner_id: string | null }[]
): UserOverviewRow[] {
  const rolesById = new Map<string, ManualRole[]>();
  for (const r of profiles) rolesById.set(r.id, sanitizeRoles(r.roles));
  const threadsByOwner = new Map<string, number>();
  for (const a of threads) {
    if (a.owner_id) threadsByOwner.set(a.owner_id, (threadsByOwner.get(a.owner_id) ?? 0) + 1);
  }
  const shopeeOwners = new Set<string>();
  for (const a of shopee) {
    if (a.owner_id) shopeeOwners.add(a.owner_id);
  }
  return users.map((u) => ({
    id: u.id,
    email: u.email,
    roles: rolesById.get(u.id) ?? [],
    threadsCount: threadsByOwner.get(u.id) ?? 0,
    shopeeBound: shopeeOwners.has(u.id)
  }));
}

// 管理頁 Threads 帳號狀態總表（owner-only）：每個發文帳號的擁有者、token 到期、狀態、斷路器冷卻。
export interface ThreadsAccountStatusRow {
  id: string;
  label: string;
  ownerEmail: string | null;
  threadsUserId: string;
  tokenExpiresAt: string | null;
  status: string;
  circuitUntil: string | null; // 仍在斷路器冷卻中的到期 ISO；未冷卻為 null
}
export async function listThreadsAccountsStatus(): Promise<ThreadsAccountStatusRow[]> {
  if (isDemoMode) return [];
  const actor = await getRealUser();
  if (!actor?.isPlatformOwner) throw new Error("forbidden: 僅限管理者");
  const [users, accounts, circuits] = await Promise.all([
    listAllUsers(),
    selectAllRows<{
      id: string;
      label: string;
      owner_id: string | null;
      threads_user_id: string;
      token_expires_at: string | null;
      status: string;
    }>("threads_accounts", "id, label, owner_id, threads_user_id, token_expires_at, status"),
    listActiveCircuits()
  ]);
  const emailById = new Map<string, string | null>();
  for (const u of users) emailById.set(u.id, u.email);
  return accounts.map((a) => {
    const circuitTime = circuits.get(a.id);
    return {
      id: a.id,
      label: a.label,
      ownerEmail: a.owner_id ? emailById.get(a.owner_id) ?? null : null,
      threadsUserId: a.threads_user_id,
      tokenExpiresAt: a.token_expires_at,
      status: a.status,
      circuitUntil: circuitTime ? new Date(circuitTime).toISOString() : null
    };
  });
}

// 管理頁贊助文紀錄總覽（owner-only）：近期各帳號的贊助文發布紀錄與驗證狀態。
export interface SponsorRecordView {
  accountId: string;
  ownerEmail: string | null;
  postId: string;
  link: string;
  atText: string; // 已格式化為台北時間的發布時刻（server 端算好，避免 client TZ/hydration 差異）
  atMs: number; // 排序用
  statusLabel: string;
  statusTone: string;
}
export async function listRecentSponsorRecords(limit = 50): Promise<SponsorRecordView[]> {
  if (isDemoMode) return [];
  const actor = await getRealUser();
  if (!actor?.isPlatformOwner) throw new Error("forbidden: 僅限管理者");
  const [users, entries] = await Promise.all([listAllUsers(), listAllSponsorRecords()]);
  const emailById = new Map<string, string | null>();
  for (const u of users) emailById.set(u.id, u.email);
  const fmt = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
  return entries
    .map((e) => {
      const atMs = Date.parse(e.rec.at);
      const status = e.rec.ownLink
        ? { statusLabel: "自有連結", statusTone: "text-ink-3" }
        : e.rec.violated
          ? { statusLabel: "違規", statusTone: "text-red-600" }
          : e.rec.verified
            ? { statusLabel: "已驗證", statusTone: "text-green-600" }
            : { statusLabel: "待驗證", statusTone: "text-amber-600" };
      return {
        accountId: e.accountId,
        ownerEmail: e.rec.ownerId ? emailById.get(e.rec.ownerId) ?? null : null,
        postId: e.rec.postId,
        link: e.rec.link,
        atText: Number.isFinite(atMs) ? fmt.format(atMs) : e.rec.at,
        atMs: Number.isFinite(atMs) ? atMs : 0,
        ...status
      };
    })
    .sort((a, b) => b.atMs - a.atMs)
    .slice(0, limit);
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
  shared: boolean; // 共享庫
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
  const { data, error } = await sb
    .from("profiles")
    .select("id, telegram_chat_id, discord_webhook_url")
    .or("telegram_chat_id.not.is.null,discord_webhook_url.not.is.null")
    .limit(limit);
  if (error) throw new Error(`列出通知會員失敗：${error.message}`);
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
